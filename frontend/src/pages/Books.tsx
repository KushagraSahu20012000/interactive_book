import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopNav } from "@/components/brainy/TopNav";
import { StickyFeedbackButtons } from "@/components/brainy/StickyFeedbackButtons";
import { createBook, deleteBook, listBooks, loginUser, loginWithGoogle, registerUser } from "@/lib/api";
import { Loader2, Trash2 } from "lucide-react";
import { clearAuthSession, isAuthenticated as hasAuthSession, saveAuthSession } from "@/lib/auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CredentialResponse, GoogleLogin } from "@react-oauth/google";

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
  isSample?: boolean;
};

const rotations = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0", "-rotate-3"];
const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

const Books = () => {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(hasAuthSession());
  const [showAuthModal, setShowAuthModal] = useState(!hasAuthSession());
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerDateOfBirth, setRegisterDateOfBirth] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

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
  const sampleBooks = useMemo(() => books.filter((book) => book.isSample), [books]);
  const generatedBooks = useMemo(() => books.filter((book) => !book.isSample), [books]);

  const refresh = async (isUserAuthenticated = authenticated) => {
    const response = await listBooks();
    const visibleBooks = isUserAuthenticated
      ? (response.books as BookSummary[])
      : (response.books as BookSummary[]).filter((book) => book.isSample);
    setBooks(visibleBooks);
  };

  useEffect(() => {
    setLoading(true);
    refresh(authenticated)
      .catch((loadError) => setError(String(loadError.message || loadError)))
      .finally(() => setLoading(false));
  }, [authenticated]);

  const completeAuth = (payload: { token: string; user: any }) => {
    saveAuthSession(payload.token, payload.user);
    setAuthenticated(true);
    setShowAuthModal(false);
    setAuthError("");
  };

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const payload = await registerUser({
        name: registerName,
        email: registerEmail,
        dateOfBirth: registerDateOfBirth,
        password: registerPassword
      });
      completeAuth(payload);
    } catch (registerError) {
      setAuthError(String((registerError as Error).message || registerError));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const payload = await loginUser({ email: loginEmail, password: loginPassword });
      completeAuth(payload);
    } catch (loginError) {
      setAuthError(String((loginError as Error).message || loginError));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential || "";
    if (!idToken) {
      setAuthError("Google login did not return a credential token.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const payload = await loginWithGoogle(idToken);
      completeAuth(payload);
    } catch (googleError) {
      setAuthError(String((googleError as Error).message || googleError));
    } finally {
      setAuthLoading(false);
    }
  };

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
      <Dialog
        open={showAuthModal}
        onOpenChange={(open) => {
          if (authenticated) {
            setShowAuthModal(open);
          }
        }}
      >
        <DialogContent className="brutal-border bg-card max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-2xl">Login to Continue</DialogTitle>
            <DialogDescription className="font-bold text-foreground">
              Sign in or create your account to make books. You can close this to browse creator samples.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <button
              type="button"
              data-sfx="toggle"
              className={`flex-1 px-3 py-2 font-display uppercase brutal-border brutal-shadow-sm ${
                authMode === "register" ? "bg-brainy-pink text-primary-foreground" : "bg-background"
              }`}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
            <button
              type="button"
              data-sfx="toggle"
              className={`flex-1 px-3 py-2 font-display uppercase brutal-border brutal-shadow-sm ${
                authMode === "login" ? "bg-brainy-pink text-primary-foreground" : "bg-background"
              }`}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
          </div>

          {authMode === "register" ? (
            <form onSubmit={handleRegister} className="space-y-3">
              <input
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                placeholder="Full name"
                className="w-full border-4 border-foreground p-2 bg-background"
                required
              />
              <input
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                type="email"
                placeholder="Email"
                className="w-full border-4 border-foreground p-2 bg-background"
                required
              />
              <input
                value={registerDateOfBirth}
                onChange={(event) => setRegisterDateOfBirth(event.target.value)}
                type="date"
                className="w-full border-4 border-foreground p-2 bg-background"
                required
              />
              <input
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                type="password"
                placeholder="Create password"
                className="w-full border-4 border-foreground p-2 bg-background"
                minLength={6}
                required
              />
              <button
                type="submit"
                disabled={authLoading}
                data-sfx="primary"
                className="w-full px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-brainy-lime"
              >
                {authLoading ? "Creating..." : "Create Account"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                type="email"
                placeholder="Email"
                className="w-full border-4 border-foreground p-2 bg-background"
                required
              />
              <input
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                type="password"
                placeholder="Password"
                className="w-full border-4 border-foreground p-2 bg-background"
                required
              />
              <button
                type="submit"
                disabled={authLoading}
                data-sfx="primary"
                className="w-full px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-brainy-sky"
              >
                {authLoading ? "Logging in..." : "Login"}
              </button>
            </form>
          )}

          <div className="border-t-4 border-foreground pt-3">
            <p className="font-display uppercase text-xs mb-2">Or continue with Google</p>
            {hasGoogleClientId ? (
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setAuthError("Google login failed")} />
            ) : (
              <p className="text-sm font-bold text-muted-foreground">Set VITE_GOOGLE_CLIENT_ID to enable Google login.</p>
            )}
          </div>

          {authError ? <p className="text-red-700 font-bold text-sm">{authError}</p> : null}
          {authenticated ? (
            <button
              type="button"
              data-sfx="destructive"
              className="px-3 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-background"
              onClick={() => {
                clearAuthSession();
                setAuthenticated(false);
                setShowAuthModal(true);
              }}
            >
              Logout
            </button>
          ) : null}
        </DialogContent>
      </Dialog>

      <TopNav />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-32 sm:pb-10">
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
              data-sfx="primary"
              onClick={() => {
                if (!authenticated) {
                  setAuthMode("register");
                  setShowAuthModal(true);
                  return;
                }
                setShowCreate(true);
              }}
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
          <div className="space-y-10">
            {sampleBooks.length > 0 ? (
              <div>
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                  <h2 className="font-display uppercase text-2xl sm:text-3xl">Creator Samples</h2>
                  <span className="bg-brainy-yellow brutal-border brutal-shadow-sm px-2 py-1 font-display uppercase text-[10px] leading-none tracking-wide">
                    More Books Incoming
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {sampleBooks.map((book, i) => (
                    <div key={book._id} className="relative w-full max-w-[280px] mx-auto sm:max-w-none">
                      <button
                        onClick={() => navigate(`/books/${book._id}?page=1`)}
                        className={`${rotations[i % rotations.length]} brutal-press text-left w-full`}
                      >
                        <div className="bg-brainy-lime brutal-border brutal-shadow overflow-hidden">
                          <div className="aspect-[4/5] relative bg-card overflow-hidden">
                            {book.coverImageUrl ? (
                              <img
                                src={book.coverImageUrl}
                                alt={`${book.title} cover`}
                                className="absolute inset-0 w-full h-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                          </div>
                        </div>
                      </button>
                      <div className="absolute bottom-3 right-3 z-10 bg-card brutal-border brutal-shadow-sm px-2 py-1 font-display uppercase text-xs">
                        Sample
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {generatedBooks.length > 0 ? (
              <div>
                <h2 className="font-display uppercase text-2xl sm:text-3xl mb-4">Your Books</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {generatedBooks.map((book, i) => (
                    <div key={book._id} className="relative w-full max-w-[280px] mx-auto sm:max-w-none">
                      <button
                        onClick={() => {
                          if (!authenticated) {
                            setAuthMode("login");
                            setShowAuthModal(true);
                            return;
                          }
                          navigate(`/books/${book._id}?page=1`);
                        }}
                        className={`${rotations[i % rotations.length]} brutal-press text-left w-full`}
                      >
                        <div className="bg-brainy-yellow brutal-border brutal-shadow overflow-hidden">
                          <div className="aspect-[4/5] relative bg-card p-5 flex flex-col justify-between">
                            {book.coverImageUrl ? (
                              <img
                                src={book.coverImageUrl}
                                alt={`${book.title} cover`}
                                className="absolute inset-0 w-full h-full object-cover opacity-45"
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
                        data-sfx="destructive"
                        disabled={deletingId === book._id}
                        className="absolute bottom-3 right-3 z-10 bg-card brutal-border brutal-shadow-sm brutal-press p-2 disabled:opacity-50"
                        aria-label="Delete book"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-50 bg-foreground/45 p-4 flex items-center justify-center">
          <form onSubmit={onCreate} className="w-full max-w-xl bg-card brutal-border brutal-shadow-lg p-6 space-y-4">
            <h2 className="font-display text-3xl uppercase">Create New Book</h2>
              <p className="font-body font-bold text-xs sm:text-sm bg-brainy-yellow/50 brutal-border px-3 py-2">
                Built with 100% open-source, free AI magic: our content is still in its awkward glow-up phase right now, and we are actively leveling it up (stock images included).
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
                data-sfx="modal"
                className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-background"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                data-sfx="primary"
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
