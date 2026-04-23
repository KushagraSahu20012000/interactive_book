import { Router } from "express";
import { FeedbackEntry } from "../models/FeedbackEntry.js";

const validSuggestionCategories = new Set([
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
]);

export function createFeedbackRouter() {
  const router = Router();

  router.post("/upgrade-request", async (req, res, next) => {
    try {
      const {
        wantsBetterContent = false,
        wantsAiGeneratedImages = false,
        willingToPayPerBook = 0,
        message = ""
      } = req.body || {};

      const normalizedAmount = Number(willingToPayPerBook);
      if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
        return res.status(400).json({ message: "willingToPayPerBook must be a valid non-negative number" });
      }

      const entry = await FeedbackEntry.create({
        type: "upgrade_request",
        wantsBetterContent: Boolean(wantsBetterContent),
        wantsAiGeneratedImages: Boolean(wantsAiGeneratedImages),
        willingToPayPerBook: normalizedAmount,
        message: typeof message === "string" ? message.trim() : ""
      });

      return res.status(201).json({ ok: true, id: String(entry._id) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/suggestion", async (req, res, next) => {
    try {
      const { category = "Other", suggestion = "" } = req.body || {};
      const normalizedCategory = validSuggestionCategories.has(category) ? category : "Other";
      const normalizedSuggestion = typeof suggestion === "string" ? suggestion.trim() : "";

      if (!normalizedSuggestion) {
        return res.status(400).json({ message: "suggestion is required" });
      }

      const entry = await FeedbackEntry.create({
        type: "suggestion",
        category: normalizedCategory,
        message: normalizedSuggestion
      });

      return res.status(201).json({ ok: true, id: String(entry._id) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
