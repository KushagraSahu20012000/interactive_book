import { FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearSession, hasActiveSession, subscribeAuthStateChange } from "@/lib/auth";
import { submitSuggestion, submitUpgradeRequest } from "@/lib/api";

const suggestionCategories = [
  "5-10",
  "10-15",
  "15-20",
  "20+",
  "ADHD",
  "Dyslexia",
  "Autism",
  "Hindi",
  "Audio",
  "Images",
  "Other",
] as const;

export function StickyFeedbackButtons() {
  const [hasSession, setHasSession] = useState(hasActiveSession());
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [wantsBetterContent, setWantsBetterContent] = useState(true);
  const [wantsAiGeneratedImages, setWantsAiGeneratedImages] = useState(false);
  const [willingToPayPerBook, setWillingToPayPerBook] = useState("");
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);

  const [category, setCategory] = useState<(typeof suggestionCategories)[number]>("10-15");
  const [suggestionText, setSuggestionText] = useState("");
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);

  useEffect(() => subscribeAuthStateChange(() => setHasSession(hasActiveSession())), []);

  const resetUpgrade = () => {
    setWantsBetterContent(true);
    setWantsAiGeneratedImages(false);
    setWillingToPayPerBook("");
    setUpgradeMessage("");
  };

  const resetSuggestion = () => {
    setCategory("10-15");
    setSuggestionText("");
  };

  const onSubmitUpgrade = async (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage("");

    if (!willingToPayPerBook.trim()) {
      setStatusMessage("Please enter how much you are willing to pay per book.");
      return;
    }

    const amount = Number(willingToPayPerBook);
    if (!Number.isFinite(amount) || amount < 0) {
      setStatusMessage("Please enter a valid amount.");
      return;
    }

    setSubmittingUpgrade(true);
    try {
      await submitUpgradeRequest({
        wantsBetterContent,
        wantsAiGeneratedImages,
        willingToPayPerBook: amount,
        message: upgradeMessage.trim(),
      });
      setStatusMessage("Upgrade request sent. Thank you!");
      setUpgradeOpen(false);
      resetUpgrade();
    } catch (error) {
      setStatusMessage(String((error as Error).message || error));
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const onSubmitSuggestion = async (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage("");

    if (!suggestionText.trim()) {
      setStatusMessage("Please add your suggestion before submitting.");
      return;
    }

    setSubmittingSuggestion(true);
    try {
      await submitSuggestion({
        category,
        suggestion: suggestionText.trim(),
      });
      setStatusMessage("Suggestion submitted. We appreciate it!");
      setSuggestionOpen(false);
      resetSuggestion();
    } catch (error) {
      setStatusMessage(String((error as Error).message || error));
    } finally {
      setSubmittingSuggestion(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
        <button
          type="button"
          data-sfx="modal"
          onClick={() => setUpgradeOpen(true)}
          className="bg-brainy-pink text-primary-foreground brutal-border brutal-shadow-sm brutal-press px-3 py-2 font-display uppercase text-xs sm:text-sm"
        >
          Request Upgrade
        </button>
        <button
          type="button"
          data-sfx="modal"
          onClick={() => setSuggestionOpen(true)}
          className="bg-brainy-sky brutal-border brutal-shadow-sm brutal-press px-3 py-2 font-display uppercase text-xs sm:text-sm"
        >
          Suggestion Box
        </button>
        {hasSession ? (
          <button
            type="button"
            data-sfx="destructive"
            onClick={() => clearSession()}
            className="bg-card brutal-border brutal-shadow-sm brutal-press px-3 py-2 font-display uppercase text-xs sm:text-sm"
          >
            Logout
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <div className="fixed bottom-24 right-4 z-40 max-w-xs bg-card brutal-border brutal-shadow-sm px-3 py-2 text-xs font-bold">
          {statusMessage}
        </div>
      ) : null}

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="brutal-border brutal-shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-2xl">Request Upgrade</DialogTitle>
            <DialogDescription className="font-bold text-foreground/80">
              Want better quality content or AI-generated images? Tell us what you need.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmitUpgrade} className="space-y-4">
            <label className="flex items-center gap-2 font-bold text-sm">
              <input
                type="checkbox"
                checked={wantsBetterContent}
                onChange={(event) => setWantsBetterContent(event.target.checked)}
              />
              Better quality content
            </label>

            <label className="flex items-center gap-2 font-bold text-sm">
              <input
                type="checkbox"
                checked={wantsAiGeneratedImages}
                onChange={(event) => setWantsAiGeneratedImages(event.target.checked)}
              />
              AI-generated images
            </label>

            <label className="block font-bold text-sm uppercase">
              How much would you pay per book (in rupees)?
              <div className="mt-2 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-display text-sm">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={willingToPayPerBook}
                  onChange={(event) => setWillingToPayPerBook(event.target.value)}
                  className="w-full border-4 border-foreground p-2 pl-8 bg-background"
                  placeholder="Example: 99"
                  required
                />
              </div>
            </label>

            <label className="block font-bold text-sm uppercase">
              Anything else?
              <textarea
                value={upgradeMessage}
                onChange={(event) => setUpgradeMessage(event.target.value)}
                className="mt-2 w-full border-4 border-foreground p-2 bg-background min-h-24"
                placeholder="Tell us what would make this worth it for you"
              />
            </label>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setUpgradeOpen(false)}
                data-sfx="modal"
                className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-background"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingUpgrade}
                data-sfx="primary"
                className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-brainy-pink text-primary-foreground disabled:opacity-50"
              >
                {submittingUpgrade ? "Submitting..." : "Submit"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={suggestionOpen} onOpenChange={setSuggestionOpen}>
        <DialogContent className="brutal-border brutal-shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase text-2xl">Suggestion Box</DialogTitle>
            <DialogDescription className="font-bold text-foreground/80">
              Share feedback and pick the area you want us to improve.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmitSuggestion} className="space-y-4">
            <label className="block font-bold text-sm uppercase">
              Category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as (typeof suggestionCategories)[number])}
                className="mt-2 w-full border-4 border-foreground p-2 bg-background"
              >
                {suggestionCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block font-bold text-sm uppercase">
              Suggestion
              <textarea
                value={suggestionText}
                onChange={(event) => setSuggestionText(event.target.value)}
                className="mt-2 w-full border-4 border-foreground p-2 bg-background min-h-28"
                placeholder="What should we improve?"
                required
              />
            </label>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setSuggestionOpen(false)}
                data-sfx="modal"
                className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-background"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingSuggestion}
                data-sfx="primary"
                className="px-4 py-2 font-display uppercase brutal-border brutal-shadow-sm brutal-press bg-brainy-sky disabled:opacity-50"
              >
                {submittingSuggestion ? "Submitting..." : "Submit"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
