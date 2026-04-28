import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2, Square, Volume2 } from "lucide-react";
import { getBookPage, getBookPages, getPageAudioUrl, requestNextPage, trackSamplePageRead } from "@/lib/api";
import { getAuthToken, getGuestKey, getOrCreateGuestKey, isAuthenticated as hasAuthSession } from "@/lib/auth";
import { socket } from "@/lib/socket";
import { PixelImageCanvas } from "@/components/PixelImageCanvas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Section = {
  position: number;
  text: string;
  imagePrompt: string;
  imageUrl: string;
  imageStatus: "queued" | "generating" | "ready" | "failed";
  imagePixelArray: number[][];
  imageWidth: number;
  imageHeight: number;
};

type PageData = {
  _id: string;
  pageNumber: number;
  title: string;
  actionItem: string;
  status: "queued" | "text_ready" | "completed" | "failed";
  sections: Section[];
};

type BookData = {
  _id: string;
  title: string;
  topic: string;
  ageGroup: string;
  neurotype: string;
  status: string;
  currentPageNumber: number;
  totalPagesGenerated: number;
  coverImagePixelArray: number[][];
  coverImageWidth: number;
  coverImageHeight: number;
  isSample?: boolean;
};

const SAMPLE_BOOK_CACHE_KEY = "bright-minds.sample-book-pages";

type SampleBookCacheEntry = {
  book: BookData;
  page: PageData | null;
};

const sectionColors = ["bg-brainy-yellow", "bg-brainy-sky", "bg-brainy-lime"];
const textColors5To10 = ["text-[#7a1f52]", "text-[#8a4317]", "text-[#3f2f86]"];
const textColors10To15 = ["text-[#6c2a46]", "text-[#6e3f28]", "text-[#35265f]"];
const textColors15To20 = ["text-[#512132]", "text-[#553120]", "text-[#2b244a]"];
const MAX_PAGE_LIMIT_MESSAGE = "Maximum page limit reached (10 pages).";
const AUDIO_RATE_LIMIT_MESSAGE = "Audio is temporarily unavailable due to API limits.";
const MIN_SAMPLE_READ_TRACK_MS = 1000;

const isTwentyPlusAgeGroup = (ageGroup?: string) => String(ageGroup || "").trim() === "20+";
const isFifteenToTwentyAgeGroup = (ageGroup?: string) => String(ageGroup || "").trim() === "15-20";
const isFiveToTenAgeGroup = (ageGroup?: string) => String(ageGroup || "").trim() === "5-10";

const ADAPTIVE_TEXT_GLOBAL_MIN_FONT_PX = 12;
const ADAPTIVE_TEXT_GLOBAL_MAX_FONT_PX = 25;
const ADAPTIVE_TEXT_PRECISION_PX = 0.5;
const ADAPTIVE_TEXT_EPSILON_PX = 1;

const getAdaptiveFontBounds = (width: number, height: number) => {
  const safeWidth = Math.max(width || 0, 240);
  const safeHeight = Math.max(height || 0, 180);
  const minDimension = Math.min(safeWidth, safeHeight);
  const minFontPx = Math.max(
    ADAPTIVE_TEXT_GLOBAL_MIN_FONT_PX,
    Math.min(16, Math.round(minDimension * 0.065))
  );
  const maxFontPx = Math.max(
    minFontPx + 4,
    Math.min(ADAPTIVE_TEXT_GLOBAL_MAX_FONT_PX, Math.round(safeWidth * 0.078))
  );

  return { minFontPx, maxFontPx };
};

const getAdaptiveLineHeight = (fontSizePx: number, minFontPx: number, maxFontPx: number) => {
  const range = maxFontPx - minFontPx || 1;
  const normalized = (fontSizePx - minFontPx) / range;
  return Number((1.48 - normalized * 0.14).toFixed(2));
};

type AdaptiveTextLayout = {
  fontSizePx: number;
  lineHeight: number;
  hasOverflow: boolean;
};

const DEFAULT_ADAPTIVE_TEXT_LAYOUT: AdaptiveTextLayout = {
  fontSizePx: 24,
  lineHeight: getAdaptiveLineHeight(24, ADAPTIVE_TEXT_GLOBAL_MIN_FONT_PX, ADAPTIVE_TEXT_GLOBAL_MAX_FONT_PX),
  hasOverflow: false,
};

const getSampleBookCache = () => {
  try {
    const raw = localStorage.getItem(SAMPLE_BOOK_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SampleBookCacheEntry>) : {};
  } catch {
    return {};
  }
};

const getCachedSampleBookPage = (bookId: string, pageNumber: number) => {
  const cache = getSampleBookCache();
  return cache[`${bookId}:${pageNumber}`] || null;
};

const setCachedSampleBookPage = (bookId: string, pageNumber: number, entry: SampleBookCacheEntry) => {
  try {
    const cache = getSampleBookCache();
    cache[`${bookId}:${pageNumber}`] = entry;
    localStorage.setItem(SAMPLE_BOOK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures.
  }
};

const setCachedSampleBookPages = (bookId: string, book: BookData, pages: PageData[]) => {
  try {
    const cache = getSampleBookCache();
    for (const samplePage of pages) {
      cache[`${bookId}:${samplePage.pageNumber}`] = {
        book,
        page: samplePage,
      };
    }
    localStorage.setItem(SAMPLE_BOOK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures.
  }
};

const renderInteractiveText = (text: string) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?](?:["'”]))\s+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return (sentences.length ? sentences : [normalized]).map((sentence, sentenceIdx) => {
    const tokens = sentence.split(/(["“”]|\s+)/).filter((token) => token.length > 0);
    return (
      <span key={`sentence-${sentenceIdx}`} className="block mb-1.5 last:mb-0">
        {tokens.map((token, tokenIdx) => {
          if (/^\s+$/.test(token)) {
            return <span key={`space-${sentenceIdx}-${tokenIdx}`}>{token}</span>;
          }
          return (
            <span
              key={`word-${sentenceIdx}-${tokenIdx}`}
              className="inline-block transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
            >
              {token}
            </span>
          );
        })}
      </span>
    );
  });
};

type AdaptiveSectionTextProps = {
  text: string;
  textColorClass: string;
  textStyleClass?: string;
  className?: string;
  containerStyle?: CSSProperties;
  centerContent?: boolean;
};

const AdaptiveSectionText = ({
  text,
  textColorClass,
  textStyleClass = "",
  className = "",
  containerStyle,
  centerContent = false,
}: AdaptiveSectionTextProps) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [layout, setLayout] = useState<AdaptiveTextLayout>(DEFAULT_ADAPTIVE_TEXT_LAYOUT);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!outer || !viewport || !measure) {
      return;
    }

    const evaluateSize = (fontSizePx: number, minFontPx: number, maxFontPx: number) => {
      const roundedFontSize = Math.round(fontSizePx / ADAPTIVE_TEXT_PRECISION_PX) * ADAPTIVE_TEXT_PRECISION_PX;
      const lineHeight = getAdaptiveLineHeight(roundedFontSize, minFontPx, maxFontPx);
      measure.style.width = `${viewport.clientWidth}px`;
      measure.style.fontSize = `${roundedFontSize}px`;
      measure.style.lineHeight = String(lineHeight);

      const fitsHeight = measure.scrollHeight <= viewport.clientHeight + ADAPTIVE_TEXT_EPSILON_PX;
      const fitsWidth = measure.scrollWidth <= viewport.clientWidth + ADAPTIVE_TEXT_EPSILON_PX;

      return {
        fontSizePx: roundedFontSize,
        lineHeight,
        fits: fitsHeight && fitsWidth,
      };
    };

    const recompute = () => {
      if (!viewport.clientWidth) {
        return;
      }

      const bounds = getAdaptiveFontBounds(viewport.clientWidth, viewport.clientHeight);

      if (!viewport.clientHeight) {
        setLayout((prev) =>
          prev.fontSizePx === bounds.maxFontPx &&
          prev.lineHeight === getAdaptiveLineHeight(bounds.maxFontPx, bounds.minFontPx, bounds.maxFontPx) &&
          prev.hasOverflow === DEFAULT_ADAPTIVE_TEXT_LAYOUT.hasOverflow
            ? prev
            : {
                fontSizePx: bounds.maxFontPx,
                lineHeight: getAdaptiveLineHeight(bounds.maxFontPx, bounds.minFontPx, bounds.maxFontPx),
                hasOverflow: false,
              }
        );
        return;
      }

      const maxResult = evaluateSize(bounds.maxFontPx, bounds.minFontPx, bounds.maxFontPx);
      if (maxResult.fits) {
        setLayout((prev) =>
          prev.fontSizePx === maxResult.fontSizePx &&
          prev.lineHeight === maxResult.lineHeight &&
          prev.hasOverflow === false
            ? prev
            : { ...maxResult, hasOverflow: false }
        );
        return;
      }

      let low = bounds.minFontPx;
      let high = bounds.maxFontPx;
      let best = evaluateSize(bounds.minFontPx, bounds.minFontPx, bounds.maxFontPx);

      while (high - low > ADAPTIVE_TEXT_PRECISION_PX) {
        const mid = (low + high) / 2;
        const result = evaluateSize(mid, bounds.minFontPx, bounds.maxFontPx);
        if (result.fits) {
          best = result;
          low = mid;
        } else {
          high = mid;
        }
      }

      const minResult = evaluateSize(bounds.minFontPx, bounds.minFontPx, bounds.maxFontPx);
      const nextLayout = minResult.fits ? { ...best, hasOverflow: false } : { ...minResult, hasOverflow: true };

      setLayout((prev) =>
        Math.abs(prev.fontSizePx - nextLayout.fontSizePx) < 0.01 &&
        Math.abs(prev.lineHeight - nextLayout.lineHeight) < 0.01 &&
        prev.hasOverflow === nextLayout.hasOverflow
          ? prev
          : nextLayout
      );
    };

    const schedule = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = window.requestAnimationFrame(recompute);
    };

    schedule();

    const resizeObserver = new ResizeObserver(schedule);

    resizeObserver.observe(outer);
    resizeObserver.observe(viewport);

    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(schedule).catch(() => {});
    }

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [text]);

  return (
    <div
      ref={outerRef}
      className={className}
      style={containerStyle}
    >
      <div
        ref={viewportRef}
        className={`relative h-full w-full min-w-0 overflow-x-hidden ${layout.hasOverflow ? "overflow-y-auto" : "overflow-y-hidden"}`}
        data-has-overflow={layout.hasOverflow ? "true" : "false"}
        style={{ scrollbarGutter: "stable" }}
      >
        <div
          ref={measureRef}
          aria-hidden="true"
          className={`invisible pointer-events-none absolute left-0 top-0 w-full section-text-readable ${textStyleClass} ${textColorClass} break-words`}
        >
          {renderInteractiveText(text)}
        </div>
        <div className={centerContent && !layout.hasOverflow ? "h-full flex items-center" : ""}>
          <p
            className={`section-text-readable ${textStyleClass} ${textColorClass} break-words w-full ${layout.hasOverflow ? "pr-2" : ""}`}
            style={{ fontSize: `${layout.fontSizePx}px`, lineHeight: layout.lineHeight }}
          >
            {renderInteractiveText(text)}
          </p>
        </div>
      </div>
    </div>
  );
};

const normalizeAudioError = (raw: string, status?: number) => {
  const text = String(raw || "").trim();
  if (!text) {
    return `Audio request failed${status ? ` (${status})` : ""}`;
  }

  let message = text;
  let detail = "";

  try {
    const parsed = JSON.parse(text) as { message?: string; detail?: string };
    message = String(parsed.message || message);
    detail = String(parsed.detail || "");
  } catch {
    // Keep original text when response is not JSON.
  }

  const lowered = `${message} ${detail}`.toLowerCase();
  const isRateLimited =
    status === 429 ||
    lowered.includes("rate limit") ||
    lowered.includes("rate_limit_exceeded") ||
    lowered.includes("tokens per day") ||
    lowered.includes("free tier");

  if (isRateLimited) {
    return AUDIO_RATE_LIMIT_MESSAGE;
  }

  if (message.startsWith("{")) {
    return `Audio request failed${status ? ` (${status})` : ""}`;
  }

  return message;
};

const BookDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const lastBookIdRef = useRef<string | null>(null);

  const pageNumber = Math.max(1, Number(searchParams.get("page") || 1));

  const [book, setBook] = useState<BookData | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingNext, setCreatingNext] = useState(false);
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [showSamplePopup, setShowSamplePopup] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [fullscreenPanelSize, setFullscreenPanelSize] = useState<{ width: number; height: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fullscreenGridRef = useRef<HTMLDivElement | null>(null);
  const audioAbortControllerRef = useRef<AbortController | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const audioRequestVersionRef = useRef(0);
  const suppressAudioErrorRef = useRef(false);
  const sampleReadStartMsRef = useRef(0);
  const sampleReadPageRef = useRef(0);

  const shouldPoll = useMemo(
    () => !book?.isSample && (!page || page.status === "queued" || page.status === "text_ready"),
    [book?.isSample, page]
  );

  const load = async () => {
    if (!id) {
      return null;
    }

    const cachedSample = getCachedSampleBookPage(id, pageNumber);
    if (cachedSample) {
      setBook(cachedSample.book);
      setPage(cachedSample.page);
      return cachedSample.book;
    }

    const response = await getBookPage(id, pageNumber);
    const nextBook = response.book as BookData;
    const nextPage = (response.page || null) as PageData | null;

    if (nextBook.isSample) {
      const sampleResponse = await getBookPages(id);
      const sampleBook = (sampleResponse.book || nextBook) as BookData;
      const samplePages = (sampleResponse.pages || []) as PageData[];
      const requestedPage = samplePages.find((candidate) => candidate.pageNumber === pageNumber) || nextPage;

      setBook(sampleBook);
      setPage(requestedPage);
      setCachedSampleBookPages(id, sampleBook, samplePages);

      if (!requestedPage) {
        setCachedSampleBookPage(id, pageNumber, {
          book: sampleBook,
          page: null,
        });
      }

      return sampleBook;
    }

    setBook(nextBook);
    setPage(nextPage);

    return nextBook;
  };

  useEffect(() => {
    if (!id) {
      return;
    }

    const switchingBook = Boolean(lastBookIdRef.current && lastBookIdRef.current !== id);
    lastBookIdRef.current = id;

    if (switchingBook) {
      setBook(null);
    }
    setPage(null);
    setLoading(true);
    load()
      .then((loadedBook) => {
        if (!loadedBook) {
          return;
        }

        if (!hasAuthSession() && !loadedBook.isSample) {
          handleCloseBook();
        }
      })
      .catch((loadError) => setError(String(loadError.message || loadError)))
      .finally(() => setLoading(false));
  }, [id, pageNumber, navigate]);

  useEffect(() => {
    if (book?.isSample) {
      setShowSamplePopup(true);
    }
  }, [book?._id, book?.isSample]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const onBookUpdate = (payload: { bookId: string }) => {
      if (payload.bookId === id) {
        load().catch(() => {});
      }
    };

    socket.on("book:updated", onBookUpdate);
    socket.on("book:failed", onBookUpdate);

    return () => {
      socket.off("book:updated", onBookUpdate);
      socket.off("book:failed", onBookUpdate);
    };
  }, [id, pageNumber]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      load().catch(() => {});
    }, 5000);

    return () => clearInterval(timer);
  }, [shouldPoll, id, pageNumber]);

  const handleNext = async () => {
    if (!id || creatingNext) {
      return;
    }

    if (book?.isSample) {
      const maxPage = Math.max(1, Number(book.totalPagesGenerated || 1));
      if (pageNumber >= maxPage) {
        setShowLimitPopup(true);
        return;
      }
      stopAudio();
      setSearchParams({ page: String(pageNumber + 1) });
      return;
    }

    stopAudio();
    setCreatingNext(true);
    setError("");

    try {
      const result = await requestNextPage(id, pageNumber);
      setSearchParams({ page: String(result.pageNumber) });
      if (result.reused) {
        setError("");
      }
    } catch (nextError) {
      const nextMessage = String(nextError.message || nextError);
      if (nextMessage.includes(MAX_PAGE_LIMIT_MESSAGE)) {
        setShowLimitPopup(true);
        return;
      }
      setError(nextMessage);
    } finally {
      setCreatingNext(false);
    }
  };

  const handlePrevious = () => {
    const previous = Math.max(1, pageNumber - 1);
    if (previous !== pageNumber) {
      stopAudio();
    }
    setError("");
    setSearchParams({ page: String(previous) });
  };

  const releaseAudioUrl = (objectUrl: string | null) => {
    if (!objectUrl) {
      return;
    }

    if (audioObjectUrlRef.current === objectUrl) {
      audioObjectUrlRef.current = null;
    }

    URL.revokeObjectURL(objectUrl);
  };

  const stopAudio = () => {
    audioRequestVersionRef.current += 1;
    audioAbortControllerRef.current?.abort();
    audioAbortControllerRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      suppressAudioErrorRef.current = true;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    }

    releaseAudioUrl(audioObjectUrlRef.current);
    setAudioState("idle");
  };

  useEffect(() => () => stopAudio(), []);
  useEffect(() => stopAudio(), [pageNumber, id]);

  useEffect(() => {
    if (!book?.isSample || !id) {
      sampleReadStartMsRef.current = 0;
      return;
    }

    if (!hasAuthSession() && !getGuestKey()) {
      getOrCreateGuestKey();
    }

    sampleReadStartMsRef.current = Date.now();
    sampleReadPageRef.current = pageNumber;

    return () => {
      const startedAt = sampleReadStartMsRef.current;
      const trackedPage = sampleReadPageRef.current || pageNumber;
      const dwellMs = Math.max(0, Date.now() - startedAt);
      sampleReadStartMsRef.current = 0;

      if (!startedAt || dwellMs < MIN_SAMPLE_READ_TRACK_MS) {
        return;
      }

      trackSamplePageRead({
        bookId: id,
        pageNumber: trackedPage,
        dwellMs,
      }).catch(() => {
        // Ignore reward tracking failures to avoid breaking reading flow.
      });
    };
  }, [book?.isSample, id, pageNumber]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {
          // Ignore fullscreen API failures during route cleanup.
        });
      }
    };
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isFullscreen) {
      setFullscreenPanelSize(null);
      return;
    }

    if (isMobileViewport) {
      setFullscreenPanelSize(null);
      return;
    }

    const grid = fullscreenGridRef.current;
    if (!grid) {
      return;
    }

    const computePanelSize = () => {
      const styles = window.getComputedStyle(grid);
      const rowGap = Number.parseFloat(styles.rowGap || "0") || 0;
      const colGap = Number.parseFloat(styles.columnGap || "0") || 0;
      const rows = 3;
      const cols = 2;
      const ratio = 21 / 9;

      const availableHeight = Math.max(0, grid.clientHeight - rowGap * (rows - 1));
      const availableWidth = Math.max(0, grid.clientWidth - colGap * (cols - 1));
      const rowHeight = availableHeight / rows;
      const colWidth = availableWidth / cols;

      const panelWidth = Math.floor(Math.min(colWidth, rowHeight * ratio));
      const panelHeight = Math.floor(panelWidth / ratio);

      setFullscreenPanelSize((prev) =>
        prev && prev.width === panelWidth && prev.height === panelHeight
          ? prev
          : { width: panelWidth, height: panelHeight }
      );
    };

    computePanelSize();

    const resizeObserver = new ResizeObserver(computePanelSize);
    resizeObserver.observe(grid);
    window.addEventListener("resize", computePanelSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", computePanelSize);
    };
  }, [isFullscreen, isMobileViewport]);

  const fullscreenPanelStyle = isFullscreen
    ? isMobileViewport
      ? ({ width: "100%", height: "100%" } as const)
      : fullscreenPanelSize
      ? ({ width: `${fullscreenPanelSize.width}px`, height: `${fullscreenPanelSize.height}px` } as const)
      : undefined
    : undefined;

  const handleToggleAudio = async () => {
    if (!id || !page) {
      return;
    }
    if (audioState === "playing") {
      stopAudio();
      return;
    }
    if (audioState === "loading") {
      return;
    }

    const hasText = (page.sections || []).some((section) => (section.text || "").trim().length > 0);
    if (!hasText) {
      setError("Page text is still generating.");
      return;
    }

    setAudioState("loading");
    setError("");
    try {
      const requestVersion = audioRequestVersionRef.current + 1;
      audioRequestVersionRef.current = requestVersion;
      suppressAudioErrorRef.current = false;
      audioAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      audioAbortControllerRef.current = abortController;
      const audioUrl = `${getPageAudioUrl(id, pageNumber)}?ts=${Date.now()}`;
      const token = getAuthToken();
      const guestKey = getGuestKey();
      const headers = new Headers();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (guestKey) {
        headers.set("X-Guest-Key", guestKey);
      }
      const response = await fetch(audioUrl, { headers, signal: abortController.signal });
      if (requestVersion !== audioRequestVersionRef.current) {
        return;
      }
      if (!response.ok) {
        const body = await response.text();
        const normalizedMessage = normalizeAudioError(body, response.status);
        throw new Error(normalizedMessage);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("audio")) {
        const body = await response.text();
        throw new Error(body || "Audio service returned non-audio response.");
      }

      const audioBlob = await response.blob();
      if (!audioBlob.size) {
        throw new Error("Audio response was empty.");
      }
      if (requestVersion !== audioRequestVersionRef.current) {
        return;
      }

      const objectUrl = URL.createObjectURL(audioBlob);
      audioObjectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => {
        releaseAudioUrl(objectUrl);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        if (requestVersion === audioRequestVersionRef.current) {
          setAudioState("idle");
        }
      };
      audio.onerror = () => {
        releaseAudioUrl(objectUrl);
        if (suppressAudioErrorRef.current) {
          suppressAudioErrorRef.current = false;
          return;
        }
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        if (requestVersion === audioRequestVersionRef.current) {
          setAudioState("idle");
          setError("Audio playback failed.");
        }
      };
      await audio.play();
      if (requestVersion !== audioRequestVersionRef.current || audioRef.current !== audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        releaseAudioUrl(objectUrl);
        return;
      }
      setAudioState("playing");
    } catch (audioError) {
      const namedError = audioError as Error & { name?: string };
      if (namedError.name === "AbortError") {
        return;
      }

      const message = String(namedError.message || audioError);
      setAudioState("idle");
      setError(message);
    } finally {
      if (audioAbortControllerRef.current?.signal.aborted) {
        audioAbortControllerRef.current = null;
      }
    }
  };

  async function exitDocumentFullscreen() {
    if (!document.fullscreenElement) {
      return;
    }

    try {
      await document.exitFullscreen();
    } catch {
      // Ignore fullscreen API failures for unsupported browsers.
    }
  }

  const handleCloseBook = () => {
    void exitDocumentFullscreen().finally(() => navigate("/books"));
  };

  if (loading && !book) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin" strokeWidth={3} />
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h2 className="font-display text-4xl uppercase">Book not found</h2>
          <button
            onClick={handleCloseBook}
            className="mt-6 font-display uppercase px-5 py-2 bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press"
          >
            ← Back to Books
          </button>
        </div>
      </div>
    );
  }

  const sections = page?.sections || [
    { position: 1, text: "Generating...", imagePrompt: "", imageUrl: "", imageStatus: "queued", imagePixelArray: [], imageWidth: 0, imageHeight: 0 },
    { position: 2, text: "Generating...", imagePrompt: "", imageUrl: "", imageStatus: "queued", imagePixelArray: [], imageWidth: 0, imageHeight: 0 },
    { position: 3, text: "Generating...", imagePrompt: "", imageUrl: "", imageStatus: "queued", imagePixelArray: [], imageWidth: 0, imageHeight: 0 }
  ];
  const rawPageTitle = (page?.title || "").trim();
  const isTitlePending =
    !rawPageTitle ||
    rawPageTitle.toLowerCase() === "generating..." ||
    !page ||
    page.status === "queued";
  const pageTitle = isTitlePending ? "Generating title..." : rawPageTitle;
  const actionItem = (page?.actionItem || "").trim();
  const titleLength = pageTitle.length;
  const titleSizeClass =
    isFullscreen
      ? titleLength <= 18
        ? "text-sm sm:text-base lg:text-lg"
        : titleLength <= 32
        ? "text-xs sm:text-sm lg:text-base"
        : titleLength <= 56
        ? "text-xs sm:text-sm"
        : "text-[11px] sm:text-xs"
      : titleLength <= 18
      ? "text-2xl sm:text-4xl lg:text-5xl"
      : titleLength <= 32
      ? "text-xl sm:text-3xl lg:text-4xl"
      : titleLength <= 56
      ? "text-lg sm:text-2xl lg:text-3xl"
      : "text-base sm:text-xl lg:text-2xl";

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await exitDocumentFullscreen();
      }
    } catch {
      // Ignore fullscreen API failures for unsupported browsers.
    }
  };

  return (
    <div className={`${isFullscreen ? "h-screen overflow-hidden" : "min-h-screen"} bg-background`}>
      <AlertDialog open={showSamplePopup} onOpenChange={setShowSamplePopup}>
        <AlertDialogContent className="brutal-border bg-brainy-lime">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase text-2xl">Creator Sample Book</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground font-bold space-y-2">
              <p>
                This is a sample provided by our creator containing the ideal book quality you can expect from this application.
              </p>
              <p>
                It is created using coming-of-age AI models, the best of them. Enjoy the book.
              </p>
              <p>
                Once completed, do not forget to click Request Upgrade and suggest the price at which you would be glad to generate your own book of this quality.
              </p>
              <p>
                For now, enjoy our completely free book generation using Create Book.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="font-display uppercase bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press">
              Start Reading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLimitPopup} onOpenChange={setShowLimitPopup}>
        <AlertDialogContent className="brutal-border bg-brainy-yellow">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase text-2xl">Yay! Your Book Is Finished</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground font-bold">
              Create another book with new topics, or go deeper with an advanced version of this topic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="font-display uppercase bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press">
              Okay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isFullscreen ? (
        <div className="px-3 sm:px-5 py-2 sm:py-2.5 border-b-[3px] border-foreground bg-background/90">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex items-center gap-2 sm:gap-3">
              <button
                onClick={handleCloseBook}
                className="bg-card brutal-border brutal-shadow-sm brutal-press p-1.5"
                aria-label="Back to books"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
              </button>

              <div className="min-w-0">
                <h1
                  className={`font-display ${titleSizeClass} uppercase leading-tight break-words`}
                  title={pageTitle}
                >
                  {isTitlePending ? (
                    <span className="inline-flex items-center gap-1.5 text-foreground/70">
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" strokeWidth={3} />
                      Generating title...
                    </span>
                  ) : (
                    pageTitle
                  )}
                </h1>
                <p className="font-bold text-[10px] sm:text-xs uppercase tracking-wide truncate text-foreground/70">{book.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
              <button
                onClick={handleToggleFullscreen}
                data-sfx="toggle"
                className="bg-card brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2"
                aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
                title={isFullscreen ? "Exit full screen" : "Enter full screen"}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="hidden sm:block w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                    <Maximize2 className="sm:hidden w-4 h-4" strokeWidth={3} />
                  </>
                ) : (
                  <>
                    <Maximize2 className="hidden sm:block w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                    <Minimize2 className="sm:hidden w-4 h-4" strokeWidth={3} />
                  </>
                )}
              </button>
              <button
                onClick={handleToggleAudio}
                data-sfx="toggle"
                disabled={audioState === "loading"}
                className="bg-brainy-yellow brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2 disabled:opacity-50"
                aria-label={audioState === "playing" ? "Stop audio" : "Play audio"}
                title={audioState === "playing" ? "Stop audio" : "Read this page aloud"}
              >
                {audioState === "loading" ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" strokeWidth={3} />
                ) : audioState === "playing" ? (
                  <Square className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                ) : (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                )}
              </button>
              <button
                onClick={handlePrevious}
                data-sfx="page"
                disabled={pageNumber <= 1}
                className="bg-card brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2 disabled:opacity-50"
                aria-label="Previous page"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
              </button>
              <button
                onClick={handleNext}
                data-sfx="page"
                disabled={creatingNext}
                className="bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2 disabled:opacity-50"
                aria-label="Next page"
                title="Next page"
              >
                {creatingNext ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" strokeWidth={3} />
                ) : (
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-brainy-lime brutal-border border-x-0 px-3 sm:px-5 py-2 sm:py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCloseBook}
              className="bg-card brutal-border brutal-shadow-sm brutal-press p-1.5"
              aria-label="Back to books"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
            </button>
          </div>

          <div className="min-w-0 text-center px-2">
            <h1
              className={`font-display ${titleSizeClass} uppercase leading-tight break-words`}
              title={pageTitle}
            >
              {isTitlePending ? (
                <span className="inline-flex items-center gap-2 text-foreground/70">
                  <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" strokeWidth={3} />
                  Generating title...
                </span>
              ) : (
                pageTitle
              )}
            </h1>
            <p className="font-bold text-xs sm:text-sm uppercase tracking-wide truncate">{book.title}</p>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleToggleFullscreen}
              data-sfx="toggle"
              className="bg-card brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2"
              aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
              title={isFullscreen ? "Exit full screen" : "Enter full screen"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="hidden sm:block w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                  <Maximize2 className="sm:hidden w-4 h-4" strokeWidth={3} />
                </>
              ) : (
                <>
                  <Maximize2 className="hidden sm:block w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                  <Minimize2 className="sm:hidden w-4 h-4" strokeWidth={3} />
                </>
              )}
            </button>
            <button
              onClick={handleToggleAudio}
              data-sfx="toggle"
              disabled={audioState === "loading"}
              className="bg-brainy-yellow brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2 disabled:opacity-50"
              aria-label={audioState === "playing" ? "Stop audio" : "Play audio"}
              title={audioState === "playing" ? "Stop audio" : "Read this page aloud"}
            >
              {audioState === "loading" ? (
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" strokeWidth={3} />
              ) : audioState === "playing" ? (
                <Square className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
              ) : (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
              )}
            </button>
            <button
              onClick={handlePrevious}
              data-sfx="page"
              disabled={pageNumber <= 1}
              className="bg-card brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2 disabled:opacity-50"
              aria-label="Previous page"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
            </button>
            <button
              onClick={handleNext}
              data-sfx="page"
              disabled={creatingNext}
              className="bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press p-1.5 sm:p-2 disabled:opacity-50"
              aria-label="Next page"
              title="Next page"
            >
              {creatingNext ? (
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" strokeWidth={3} />
              ) : (
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
              )}
            </button>
          </div>
        </div>
      )}

      {error ? <p className="px-6 pt-3 text-red-700 font-bold">{error}</p> : null}

      <div className={`${isFullscreen ? "h-[calc(100vh-56px)] sm:h-[calc(100vh-62px)] overflow-hidden px-2.5 sm:px-3 pt-2 pb-3 sm:pb-4" : "px-3 sm:px-6 py-3 sm:py-4"}`}>
        <div
          ref={fullscreenGridRef}
          className={`${isFullscreen ? "h-full max-w-none mx-auto grid grid-rows-3 gap-2" : "max-w-6xl mx-auto flex flex-col gap-3 sm:gap-4 pb-16"}`}
        >
          {[0, 1, 2].map((rowIdx) => {
            const section = sections[rowIdx];
            const imageOnLeft = rowIdx % 2 === 0;
            const imgBg = sectionColors[rowIdx];
            const txtColor = isTwentyPlusAgeGroup(book.ageGroup)
              ? "text-black"
              : isFifteenToTwentyAgeGroup(book.ageGroup)
              ? textColors15To20[rowIdx]
              : isFiveToTenAgeGroup(book.ageGroup)
              ? textColors5To10[rowIdx]
              : textColors10To15[rowIdx];
            const textStyleClass = isFifteenToTwentyAgeGroup(book.ageGroup)
              ? "section-text-15-20-mature"
              : isTwentyPlusAgeGroup(book.ageGroup)
              ? "section-text-20-plus"
              : isFiveToTenAgeGroup(book.ageGroup)
              ? "section-text-5-10-bright"
              : "section-text-10-15-mature";
            const sectionText = (section.text || "").trim();

            return (
              <div
                key={`${pageNumber}-${rowIdx}`}
                className={`${
                  isFullscreen
                    ? isMobileViewport
                      ? "min-h-0 overflow-hidden grid grid-cols-2 gap-2 items-stretch"
                      : "min-h-0 overflow-hidden grid [grid-template-columns:max-content_max-content] gap-2 items-stretch justify-center"
                    : "flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-2"
                } ${
                  imageOnLeft ? "" : isFullscreen ? "[&>*:first-child]:order-2" : "lg:[&>*:first-child]:order-2"
                }`}
              >
                <div
                  className={`${imgBg} brutal-border brutal-shadow-sm overflow-hidden ${
                    isFullscreen
                      ? isMobileViewport
                        ? "min-w-0 min-h-0 w-full h-full"
                        : "shrink-0"
                      : "aspect-[16/10] md:aspect-[18/10] lg:aspect-[21/9]"
                  }`}
                  style={fullscreenPanelStyle}
                >
                  <PixelImageCanvas
                    pixelArray={section.imagePixelArray}
                    imageUrl={section.imageUrl}
                    width={section.imageWidth}
                    height={section.imageHeight}
                    alt={`${book.title} — part ${section.position}`}
                    fallbackText={section.imagePrompt || "Generating..."}
                  />
                </div>
                <AdaptiveSectionText
                  text={sectionText || "Generating section text..."}
                  textColorClass={txtColor}
                  textStyleClass={textStyleClass}
                  centerContent={Boolean(book.isSample)}
                  containerStyle={fullscreenPanelStyle}
                  className={`${
                    isFullscreen
                      ? isMobileViewport
                        ? "min-w-0 min-h-0 w-full h-full overflow-hidden p-2 sm:p-2.5"
                        : "shrink-0 p-2.5 sm:p-3"
                      : "p-3 sm:p-5 h-[clamp(180px,42vw,260px)] md:h-[clamp(210px,32vw,290px)] lg:h-[clamp(200px,18vw,250px)]"
                  }`}
                />
              </div>
            );
          })}

          {!isFullscreen && actionItem ? (
            <div className="bg-card brutal-border brutal-shadow-sm px-3 py-2 sm:px-4 sm:py-3">
              <p className="font-body font-bold text-sm sm:text-base leading-snug">
                <span className="font-display uppercase text-xs sm:text-sm mr-2">Action Item:</span>
                {actionItem}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="fixed bottom-4 right-4 z-20 bg-card brutal-border brutal-shadow-sm px-3 py-1.5 font-display uppercase text-xs sm:text-sm">
        Page {pageNumber}
      </div>

    </div>
  );
};

export default BookDetail;
