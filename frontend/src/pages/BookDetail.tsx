import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Square, Volume2 } from "lucide-react";
import { getBookPage, getPageAudioUrl, requestNextPage } from "@/lib/api";
import { socket } from "@/lib/socket";
import { PixelImageCanvas } from "@/components/PixelImageCanvas";
import { StickyFeedbackButtons } from "@/components/brainy/StickyFeedbackButtons";
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
};

const sectionColors = ["bg-brainy-yellow", "bg-brainy-sky", "bg-brainy-lime"];
const textColors = ["bg-brainy-pink", "bg-brainy-coral", "bg-brainy-purple"];
const MAX_PAGE_LIMIT_MESSAGE = "Maximum page limit reached (10 pages).";

const BookDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const pageNumber = Math.max(1, Number(searchParams.get("page") || 1));

  const [book, setBook] = useState<BookData | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingNext, setCreatingNext] = useState(false);
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const suppressAudioErrorRef = useRef(false);

  const shouldPoll = useMemo(
    () => !page || page.status === "queued" || page.status === "text_ready",
    [page]
  );

  const load = async () => {
    if (!id) {
      return;
    }

    const response = await getBookPage(id, pageNumber);
    setBook(response.book as BookData);
    setPage((response.page || null) as PageData | null);
  };

  useEffect(() => {
    if (!id) {
      return;
    }

    setLoading(true);
    load()
      .catch((loadError) => setError(String(loadError.message || loadError)))
      .finally(() => setLoading(false));
  }, [id, pageNumber]);

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
      load().catch(() => {});
    }, 2000);

    return () => clearInterval(timer);
  }, [shouldPoll, id, pageNumber]);

  const handleNext = async () => {
    if (!id || creatingNext) {
      return;
    }

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
    setError("");
    setSearchParams({ page: String(previous) });
  };

  const stopAudio = () => {
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
    setAudioState("idle");
  };

  useEffect(() => () => stopAudio(), []);
  useEffect(() => stopAudio(), [pageNumber, id]);

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
      suppressAudioErrorRef.current = false;
      const audio = new Audio(`${getPageAudioUrl(id, pageNumber)}?ts=${Date.now()}`);
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        setAudioState("idle");
      };
      audio.onerror = () => {
        if (suppressAudioErrorRef.current) {
          suppressAudioErrorRef.current = false;
          return;
        }
        audioRef.current = null;
        setAudioState("idle");
        setError("Audio playback failed.");
      };
      await audio.play();
      setAudioState("playing");
    } catch (audioError) {
      setAudioState("idle");
      setError(String((audioError as Error).message || audioError));
    }
  };

  if (loading) {
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
            onClick={() => navigate("/books")}
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
    titleLength <= 18
      ? "text-2xl sm:text-4xl lg:text-5xl"
      : titleLength <= 32
      ? "text-xl sm:text-3xl lg:text-4xl"
      : titleLength <= 56
      ? "text-lg sm:text-2xl lg:text-3xl"
      : "text-base sm:text-xl lg:text-2xl";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <AlertDialog open={showLimitPopup} onOpenChange={setShowLimitPopup}>
        <AlertDialogContent className="brutal-border bg-brainy-yellow">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase text-2xl">Page Limit Reached</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground font-bold">
              This book already has 10 pages. Start a new book if you want to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="font-display uppercase bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press">
              Okay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="bg-brainy-lime brutal-border border-x-0 px-3 sm:px-6 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/books")}
            className="bg-card brutal-border brutal-shadow-sm brutal-press p-2"
            aria-label="Back to books"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={3} />
          </button>
          <span className="font-display text-[10px] sm:text-xs uppercase tracking-wider text-foreground/80">
            Page {pageNumber}
          </span>
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
            onClick={handleToggleAudio}
            disabled={audioState === "loading"}
            className="bg-brainy-yellow brutal-border brutal-shadow-sm brutal-press p-2 disabled:opacity-50"
            aria-label={audioState === "playing" ? "Stop audio" : "Play audio"}
            title={audioState === "playing" ? "Stop audio" : "Read this page aloud"}
          >
            {audioState === "loading" ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={3} />
            ) : audioState === "playing" ? (
              <Square className="w-5 h-5" strokeWidth={3} />
            ) : (
              <Volume2 className="w-5 h-5" strokeWidth={3} />
            )}
          </button>
          <button
            onClick={handlePrevious}
            disabled={pageNumber <= 1}
            className="bg-card brutal-border brutal-shadow-sm brutal-press p-2 disabled:opacity-50"
            aria-label="Previous page"
            title="Previous page"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={3} />
          </button>
          <button
            onClick={handleNext}
            disabled={creatingNext}
            className="bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press p-2 disabled:opacity-50"
            aria-label="Next page"
            title="Next page"
          >
            {creatingNext ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={3} />
            ) : (
              <ChevronRight className="w-5 h-5" strokeWidth={3} />
            )}
          </button>
        </div>
      </div>

      {error ? <p className="px-6 pt-3 text-red-700 font-bold">{error}</p> : null}

      <div className="flex-1 min-h-0 px-3 sm:px-6 py-3 sm:py-4 overflow-y-auto">
        <div className="max-w-6xl mx-auto h-full flex flex-col gap-3 sm:gap-4 pb-4">
          {[0, 1, 2].map((rowIdx) => {
            const section = sections[rowIdx];
            const imageOnLeft = rowIdx % 2 === 0;
            const imgBg = sectionColors[rowIdx];
            const txtBg = textColors[rowIdx];

            return (
              <div
                key={rowIdx}
                className={`flex-1 min-h-0 grid grid-cols-2 gap-3 sm:gap-4 ${
                  imageOnLeft ? "" : "[&>*:first-child]:order-2"
                }`}
              >
                <div className={`${imgBg} brutal-border brutal-shadow-sm overflow-hidden`}>
                  <PixelImageCanvas
                    pixelArray={section.imagePixelArray}
                    imageUrl={section.imageUrl}
                    width={section.imageWidth}
                    height={section.imageHeight}
                    alt={`${book.title} — part ${section.position}`}
                    fallbackText={section.imagePrompt || "Generating..."}
                  />
                </div>
                <div className={`${txtBg} brutal-border brutal-shadow-sm p-3 sm:p-5 flex items-center`}>
                  <p className="font-body font-bold text-sm sm:text-base lg:text-lg leading-snug">
                    {section.text || "Generating section text..."}
                  </p>
                </div>
              </div>
            );
          })}

          {actionItem ? (
            <div className="bg-card brutal-border brutal-shadow-sm px-3 py-2 sm:px-4 sm:py-3">
              <p className="font-body font-bold text-sm sm:text-base leading-snug">
                <span className="font-display uppercase text-xs sm:text-sm mr-2">Action Item:</span>
                {actionItem}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <StickyFeedbackButtons />
    </div>
  );
};

export default BookDetail;
