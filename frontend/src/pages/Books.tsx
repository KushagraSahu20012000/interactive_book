import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopNav } from "@/components/brainy/TopNav";
import { StickyFeedbackButtons } from "@/components/brainy/StickyFeedbackButtons";
import { createBook, deleteBook, listBooks } from "@/lib/api";
import { Loader2, Trash2 } from "lucide-react";

type BookSummary = {
  _id: string;
  title: string;
  topic: string;
  ageGroup: string;
  neurotype: string;
  language: string;
  status: string;
  currentPageNumber: number;
  totalPagesGenerated: number;
  coverImageUrl?: string;
};

const rotations = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0", "-rotate-3"];

const Books = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [ageGroup, setAgeGroup] = useState<"5-10" | "10-15" | "15-20" | "20+">("10-15");
  const [neurotype, setNeurotype] = useState<"ADHD" | "Dyslexia" | "Autism" | "None">("None");
  const [language, setLanguage] = useState<"English" | "Hindi">("English");

  const liveCount = useMemo(() => books.filter((book) => book.status !== "failed").length, [books]);

  const refresh = async () => {
    const response = await listBooks();
    setBooks(response.books as BookSummary[]);
  };

  useEffect(() => {
    refresh()
      .catch((loadError) => setError(String(loadError.message || loadError)))
      .finally(() => setLoading(false));
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!topic.trim()) {
      setError("Topic is required");
      return;
    }

    setSaving(true);
    try {
      const created = await createBook({
        topic: topic.trim(),
        description: description.trim(),
        ageGroup,
        neurotype,
        language
      });

      setShowCreate(false);
      setTopic("");
      setDescription("");
      await refresh();
      navigate(`/books/${created.bookId}?page=1`);
    } catch (createError) {
      setError(String(createError.message || createError));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (bookId: string) => {
    setDeletingId(bookId);
    setError("");
    try {
      await deleteBook(bookId);
      await refresh();
    } catch (deleteError) {
      setError(String(deleteError.message || deleteError));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <h1 className="font-display text-5xl sm:text-7xl uppercase leading-none">
              The <span className="bg-brainy-pink text-primary-foreground brutal-border px-3 inline-block -rotate-1 brutal-shadow-sm">Bookshelf</span>
            </h1>
            <p className="font-body font-bold text-lg mt-3">Create and grow personalized learning books.</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="bg-brainy-lime brutal-border brutal-shadow-sm px-4 py-2 font-display uppercase text-sm">
              🔴 Live · {liveCount} books
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="bg-brainy-sky brutal-border brutal-shadow-sm brutal-press px-4 py-2 font-display uppercase text-sm flex items-center gap-2"
            >
              <span className="inline-flex items-center justify-center w-5 h-5 bg-card brutal-border text-[10px]">+</span>
              Create Book
            </button>
          </div>
        </div>

        {error ? <p className="mb-4 text-red-700 font-bold">{error}</p> : null}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin" strokeWidth={3} />
          </div>
        ) : books.length === 0 ? (
          <div className="bg-card brutal-border brutal-shadow p-10 text-center font-display uppercase text-xl">
            No books yet. Create your first AI-powered book.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {books.map((book, i) => (
              <div key={book._id} className="relative">
                <button
                  onClick={() => navigate(`/books/${book._id}?page=1`)}
                  className={`${rotations[i % rotations.length]} brutal-press text-left w-full`}
                >
                  <div className="bg-brainy-yellow brutal-border brutal-shadow overflow-hidden">
                    <div className="aspect-[4/5] relative bg-card p-5 flex flex-col justify-between">
                      {book.coverImageUrl ? (
                        <img
                          src={book.coverImageUrl}
                          alt={`${book.title} cover`}
                          className="absolute inset-0 w-full h-full object-cover opacity-30"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <div>
                        <p className="font-display uppercase text-xs mb-2">{book.status}</p>
                        <h3 className="font-display text-xl sm:text-2xl uppercase leading-tight mb-2">{book.title}</h3>
                        <p className="font-body font-bold text-sm">Topic: {book.topic}</p>
                      </div>

                      <div className="text-sm font-bold">
                        <p>Age: {book.ageGroup}</p>
                        <p>Neurotype: {book.neurotype}</p>
                        <p>Language: {book.language || "English"}</p>
                        <p>Pages: {book.totalPagesGenerated}</p>
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onDelete(book._id);
                  }}
                  disabled={deletingId === book._id}
                  className="absolute bottom-3 right-3 z-10 bg-card brutal-border brutal-shadow-sm brutal-press p-2 disabled:opacity-50"
                  aria-label="Delete book"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-50 bg-foreground/45 p-4 flex items-center justify-center">
          <form onSubmit={onCreate} className="w-full max-w-xl bg-card brutal-border brutal-shadow-lg p-6 space-y-4">
            <h2 className="font-display text-3xl uppercase">Create New Book</h2>
              <p className="font-body font-bold text-xs sm:text-sm bg-brainy-yellow/50 brutal-border px-3 py-2">
                Built with 100% open-source, free AI magic: please bear with occasional content-quality hiccups and, of course, the stock images while we keep leveling this up.
              </p>

            <label className="block font-bold text-sm uppercase">
              Topic
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="mt-2 w-full border-4 border-foreground p-2 bg-background"
                placeholder="Example: critical thinking"
                required
              />
            </label>

            <label className="block font-bold text-sm uppercase">
              Description (optional)
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-2 w-full border-4 border-foreground p-2 bg-background min-h-24"
                placeholder="Optional guidance for the AI"
              />
            </label>

            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block font-bold text-sm uppercase">
                Age
                <select
                  value={ageGroup}
                  onChange={(event) => setAgeGroup(event.target.value as typeof ageGroup)}
                  className="mt-2 w-full border-4 border-foreground p-2 bg-background"
                >
                  <option value="5-10">5-10</option>
                  <option value="10-15">10-15</option>
                  <option value="15-20">15-20</option>
                  <option value="20+">20+</option>
                </select>
              </label>

              <label className="block font-bold text-sm uppercase">
                Neurotype
                <select
                  value={neurotype}
                  onChange={(event) => setNeurotype(event.target.value as typeof neurotype)}
                  className="mt-2 w-full border-4 border-foreground p-2 bg-background"
                >
                  <option value="ADHD">ADHD</option>
                  <option value="Dyslexia">Dyslexia</option>
                  <option value="Autism">Autism</option>
                  <option value="None">None</option>
                </select>
              </label>

              <label className="block font-bold text-sm uppercase">
                Language
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as typeof language)}
                  className="mt-2 w-full border-4 border-foreground p-2 bg-background"
                >
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                </select>
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-background"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-brainy-pink text-primary-foreground"
              >
                {saving ? "Creating..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <StickyFeedbackButtons />
    </div>
  );
};

export default Books;
