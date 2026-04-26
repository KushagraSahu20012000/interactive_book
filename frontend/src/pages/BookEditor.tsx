import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { TopNav } from "@/components/brainy/TopNav";
import { StickyFeedbackButtons } from "@/components/brainy/StickyFeedbackButtons";
import { getBookPages, updateBookPageText } from "@/lib/api";

type Section = {
  position: number;
  text: string;
};

type PageData = {
  _id: string;
  pageNumber: number;
  title: string;
  status: string;
  sections: Section[];
};

type BookData = {
  _id: string;
  title: string;
  topic: string;
  totalPagesGenerated: number;
  isSample?: boolean;
};

type SelectedSection = {
  key: string;
  pageNumber: number;
  position: number;
  pageTitle: string;
  text: string;
};

const clonePages = (pages: PageData[]) =>
  pages.map((page) => ({
    ...page,
    sections: (page.sections || []).map((section) => ({
      position: section.position,
      text: section.text || "",
    })),
  }));

const BookEditor = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [book, setBook] = useState<BookData | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [originalPages, setOriginalPages] = useState<PageData[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!id) {
      navigate("/books");
      return;
    }

    setLoading(true);
    setError("");
    setSaveMessage("");

    getBookPages(id)
      .then((response) => {
        const nextBook = (response.book || null) as BookData | null;
        const nextPages = clonePages((response.pages || []) as PageData[]);

        if (!nextBook) {
          throw new Error("Book not found.");
        }

        if (nextBook.isSample) {
          navigate(`/books/${id}?page=1`);
          return;
        }

        setBook(nextBook);
        setPages(nextPages);
        setOriginalPages(clonePages(nextPages));

        const firstSection = nextPages
          .flatMap((page) => (page.sections || []).map((section) => `${page.pageNumber}-${section.position}`))
          .at(0) || "";
        setSelectedKey(firstSection);
      })
      .catch((loadError) => {
        setError(String((loadError as Error).message || loadError));
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const sectionItems = useMemo<SelectedSection[]>(() => {
    return pages.flatMap((page) =>
      (page.sections || [])
        .slice()
        .sort((left, right) => left.position - right.position)
        .map((section) => ({
          key: `${page.pageNumber}-${section.position}`,
          pageNumber: page.pageNumber,
          position: section.position,
          pageTitle: page.title || `Page ${page.pageNumber}`,
          text: section.text || "",
        }))
    );
  }, [pages]);

  const selectedSection = sectionItems.find((item) => item.key === selectedKey) || sectionItems[0] || null;

  useEffect(() => {
    if (!selectedSection && sectionItems[0]) {
      setSelectedKey(sectionItems[0].key);
    }
  }, [sectionItems, selectedSection]);

  const isDirty = useMemo(() => {
    return JSON.stringify(pages) !== JSON.stringify(originalPages);
  }, [pages, originalPages]);

  const updateSectionText = (pageNumber: number, position: number, nextText: string) => {
    setPages((currentPages) =>
      currentPages.map((page) => {
        if (page.pageNumber !== pageNumber) {
          return page;
        }

        return {
          ...page,
          sections: (page.sections || []).map((section) =>
            section.position === position
              ? { ...section, text: nextText }
              : section
          ),
        };
      })
    );
    setSaveMessage("");
  };

  const handleSave = async () => {
    if (!id || !isDirty) {
      return;
    }

    setSaving(true);
    setError("");
    setSaveMessage("");

    try {
      const changedPages = pages.filter((page, index) => {
        return JSON.stringify(page.sections || []) !== JSON.stringify(originalPages[index]?.sections || []);
      });

      await Promise.all(
        changedPages.map((page) =>
          updateBookPageText(id, page.pageNumber, {
            sections: (page.sections || []).map((section) => ({
              position: section.position,
              text: section.text || "",
            })),
          })
        )
      );

      const snapshot = clonePages(pages);
      setOriginalPages(snapshot);
      setPages(snapshot);
      setSaveMessage("Saved.");
    } catch (saveError) {
      setError(String((saveError as Error).message || saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!id) {
      navigate("/books");
      return;
    }

    navigate(`/books/${id}?page=${selectedSection?.pageNumber || 1}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-40">
        <div className="flex items-start justify-between gap-6 flex-wrap mb-8">
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleCancel}
              data-sfx="nav"
              className="inline-flex items-center gap-2 px-3 py-2 bg-card brutal-border brutal-shadow-sm brutal-press font-display uppercase text-xs"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={3} />
              Back To Book
            </button>
            <div>
              <p className="font-display uppercase text-xs tracking-[0.18em] text-foreground/70">Text Editor</p>
              <h1 className="font-display uppercase text-4xl sm:text-6xl leading-none mt-2">{book?.title || "Book Editor"}</h1>
              <p className="font-body font-bold text-base sm:text-lg mt-3">Edit section text for each generated page, then save when you are done.</p>
            </div>
          </div>
          <div className="bg-card brutal-border brutal-shadow-sm px-4 py-3 min-w-[180px]">
            <p className="font-display uppercase text-[10px] tracking-[0.18em]">Pages</p>
            <p className="font-display text-2xl leading-none mt-1">{pages.length || book?.totalPagesGenerated || 0}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin" strokeWidth={3} />
          </div>
        ) : error ? (
          <div className="bg-[#ffd9d2] brutal-border brutal-shadow-sm p-4 font-bold text-sm">{error}</div>
        ) : !sectionItems.length ? (
          <div className="bg-card brutal-border brutal-shadow p-10 text-center font-display uppercase text-xl">No editable text sections found for this book.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className="bg-card brutal-border brutal-shadow p-6 space-y-5">
              <div className="space-y-2">
                <p className="font-display uppercase text-xs tracking-[0.16em] text-foreground/70">
                  Page {selectedSection?.pageNumber} Section {selectedSection?.position}
                </p>
                <h2 className="font-display uppercase text-2xl sm:text-3xl leading-tight">{selectedSection?.pageTitle}</h2>
              </div>

              <label className="block space-y-2">
                <span className="font-display uppercase text-xs tracking-[0.16em]">Section Text</span>
                <textarea
                  value={selectedSection?.text || ""}
                  onChange={(event) => {
                    if (!selectedSection) {
                      return;
                    }
                    updateSectionText(selectedSection.pageNumber, selectedSection.position, event.target.value);
                  }}
                  className="w-full min-h-[320px] border-4 border-foreground bg-background p-4 font-body font-bold text-base leading-7 resize-y"
                />
              </label>

              {saveMessage ? <p className="font-bold text-sm text-[#0f7b0f]">{saveMessage}</p> : null}

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  data-sfx="primary"
                  className="inline-flex items-center gap-2 px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-brainy-pink text-primary-foreground disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={3} /> : <Save className="w-4 h-4" strokeWidth={3} />}
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  data-sfx="modal"
                  className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-background"
                >
                  Cancel
                </button>
              </div>
            </div>

            <aside className="bg-brainy-yellow brutal-border brutal-shadow p-4 lg:sticky lg:top-24">
              <p className="font-display uppercase text-sm mb-3">Section Index</p>
              <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                {sectionItems.map((item) => {
                  const isActive = item.key === selectedSection?.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedKey(item.key)}
                      data-sfx="toggle"
                      className={`w-full text-left brutal-border brutal-shadow-sm px-3 py-3 font-bold ${isActive ? "bg-brainy-pink text-primary-foreground" : "bg-card"}`}
                    >
                      <p className="font-display uppercase text-[11px] leading-none">Page {item.pageNumber} Section {item.position}</p>
                      <p className="text-xs mt-2 line-clamp-3 leading-5">{item.text.trim() || "Empty section"}</p>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </section>
      <StickyFeedbackButtons />
    </div>
  );
};

export default BookEditor;