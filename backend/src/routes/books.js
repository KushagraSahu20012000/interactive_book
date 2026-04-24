import { Router } from "express";
import { Book } from "../models/Book.js";
import { Page } from "../models/Page.js";
import { SampleBook } from "../models/SampleBook.js";
import { SamplePage } from "../models/SamplePage.js";
import { GenerationTask } from "../models/GenerationTask.js";
import { submitCreateBookJob, submitNextPageJob } from "../services/aiClient.js";
import { monitorTaskLoop } from "../services/taskMonitor.js";
import { attachAuthOptional, requireAuth } from "../middleware/auth.js";

export function createBooksRouter(io) {
  const router = Router();
  const validAgeGroups = new Set(["5-10", "10-15", "15-20", "20+"]);
  const validNeurotypes = new Set(["ADHD", "Dyslexia", "Autism", "None"]);
  const validLanguages = new Set(["English", "Hindi"]);

  const getRequesterIdentity = (req) => {
    const userId = req.auth?.sub ? String(req.auth.sub) : "";
    const guestKey = typeof req.headers["x-guest-key"] === "string" ? String(req.headers["x-guest-key"]).trim() : "";

    return {
      userId,
      guestKey,
    };
  };

  router.use(attachAuthOptional);

  const getBookRecord = async (bookId, identity = { userId: "", guestKey: "" }) => {
    const [book, sampleBook] = await Promise.all([Book.findById(bookId), SampleBook.findById(bookId)]);
    if (book) {
      const ownsAsUser = identity.userId && book.userId && String(book.userId) === identity.userId;
      const ownsAsGuest = identity.guestKey && book.guestKey && String(book.guestKey) === identity.guestKey;
      if (!ownsAsUser && !ownsAsGuest) {
        return null;
      }
      return { kind: "book", doc: book };
    }
    if (sampleBook) {
      return { kind: "sample", doc: sampleBook };
    }
    return null;
  };

  router.get("/", async (req, res, next) => {
    try {
      const identity = getRequesterIdentity(req);
      const bookFilter = identity.userId
        ? { userId: identity.userId }
        : identity.guestKey
        ? { guestKey: identity.guestKey }
        : null;
      const [books, sampleBooks, totalActiveGeneratedBooks] = await Promise.all([
        bookFilter
          ? Book.find(bookFilter)
          .sort({ createdAt: -1 })
          .select("title topic ageGroup neurotype language status currentPageNumber totalPagesGenerated coverImageUrl createdAt")
          .lean()
          : Promise.resolve([]),
        SampleBook.find()
          .sort({ createdAt: -1 })
          .select("title topic ageGroup neurotype language status currentPageNumber totalPagesGenerated coverImageUrl createdAt isSample")
          .lean(),
        Book.countDocuments({ status: { $ne: "failed" } })
      ]);

      const activeSampleBooks = sampleBooks.filter((book) => book.status !== "failed").length;

      return res.json({
        books: [...sampleBooks, ...books],
        liveCountOverall: totalActiveGeneratedBooks + activeSampleBooks
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const identity = getRequesterIdentity(req);
      const userId = identity.userId;
      const guestKey = identity.guestKey;
      if (!userId && !guestKey) {
        return res.status(401).json({ message: "Login or continue as guest to create books." });
      }

      const {
        topic,
        description = "",
        ageGroup: rawAgeGroup = "15-20",
        neurotype: rawNeurotype = "None",
        language: rawLanguage = "English"
      } = req.body;

      if (!topic || typeof topic !== "string") {
        return res.status(400).json({ message: "topic is required" });
      }

      const normalizedTopic = topic.trim();
      const normalizedDescription = typeof description === "string" ? description.trim() : "";
      const ageGroup = validAgeGroups.has(rawAgeGroup) ? rawAgeGroup : "15-20";
      const neurotype = validNeurotypes.has(rawNeurotype) ? rawNeurotype : "None";
      const language = validLanguages.has(rawLanguage) ? rawLanguage : "English";

      if (!normalizedTopic) {
        return res.status(400).json({ message: "topic is required" });
      }

      const book = await Book.create({
        userId: userId || undefined,
        guestKey,
        topic: normalizedTopic,
        description: normalizedDescription,
        ageGroup,
        neurotype,
        language,
        title: "Generating...",
        status: "queued"
      });

      const page = await Page.create({
        bookId: book._id,
        pageNumber: 1,
        status: "queued"
      });

      const ai = await submitCreateBookJob({
        topic: normalizedTopic,
        description: normalizedDescription,
        age_group: ageGroup,
        neurotype,
        language,
        memory_key: String(book._id),
        page_number: 1
      });

      const task = await GenerationTask.create({
        bookId: book._id,
        pageId: page._id,
        taskType: "create_book",
        aiJobId: ai.job_id,
        status: "queued"
      });

      page.aiJobId = ai.job_id;
      await page.save();

      monitorTaskLoop(String(task._id), io).catch((error) => console.error("Monitor loop error", error));

      return res.status(201).json({
        bookId: String(book._id),
        pageId: String(page._id),
        aiJobId: ai.job_id
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:bookId", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, getRequesterIdentity(req));
      if (!record) {
        return res.status(404).json({ message: "Book not found" });
      }

      const book = record.doc.toObject();
      const isSample = record.kind === "sample";

      const pageNumber = Number(req.query.pageNumber || book.currentPageNumber || 1);
      const page = isSample
        ? await SamplePage.findOne({ sampleBookId: book._id, pageNumber }).lean()
        : await Page.findOne({ bookId: book._id, pageNumber }).lean();

      if (isSample) {
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
      }

      return res.json({
        book: { ...book, isSample },
        page: page || null
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/:bookId/next", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, getRequesterIdentity(req));
      if (!record) {
        return res.status(404).json({ message: "Book not found" });
      }

      if (record.kind === "sample") {
        return res.status(400).json({ message: "Sample book pages are fixed and cannot be generated." });
      }

      const book = record.doc;

      const fromPageNumber = Number(req.body?.fromPageNumber) || 0;
      const latestPage = await Page.findOne({ bookId: book._id }).sort({ pageNumber: -1 });

      let nextPageNumber;
      if (fromPageNumber > 0) {
        nextPageNumber = fromPageNumber + 1;
      } else if (latestPage && (latestPage.status === "queued" || latestPage.status === "text_ready")) {
        return res.status(200).json({
          pageId: String(latestPage._id),
          pageNumber: latestPage.pageNumber,
          aiJobId: latestPage.aiJobId,
          reused: true
        });
      } else {
        const basePage = latestPage?.pageNumber || Math.max(book.currentPageNumber || 0, 1);
        nextPageNumber = basePage + 1;
      }

      const existing = await Page.findOne({ bookId: book._id, pageNumber: nextPageNumber });
      if (existing) {
        return res.status(200).json({
          pageId: String(existing._id),
          pageNumber: existing.pageNumber,
          aiJobId: existing.aiJobId,
          reused: true
        });
      }

      if (nextPageNumber > 10) {
        return res.status(400).json({ message: "Maximum page limit reached (10 pages)." });
      }

      const page = await Page.create({
        bookId: book._id,
        pageNumber: nextPageNumber,
        status: "queued"
      });

      const ai = await submitNextPageJob({
        topic: book.topic,
        description: book.description,
        age_group: book.ageGroup,
        neurotype: book.neurotype,
        language: book.language || "English",
        memory_key: String(book._id),
        page_number: nextPageNumber
      });

      const task = await GenerationTask.create({
        bookId: book._id,
        pageId: page._id,
        taskType: "next_page",
        aiJobId: ai.job_id,
        status: "queued"
      });

      page.aiJobId = ai.job_id;
      await page.save();

      monitorTaskLoop(String(task._id), io).catch((error) => console.error("Monitor loop error", error));

      return res.status(201).json({
        pageId: String(page._id),
        pageNumber: nextPageNumber,
        aiJobId: ai.job_id,
        reused: false
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:bookId/pages/:pageNumber/audio", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, req.auth?.sub);
      if (!record) {
        return res.status(404).json({ message: "Book not found" });
      }

      const book = record.doc.toObject();
      const isSample = record.kind === "sample";

      const pageNumber = Number(req.params.pageNumber);
      const page = isSample
        ? await SamplePage.findOne({ sampleBookId: book._id, pageNumber }).lean()
        : await Page.findOne({ bookId: book._id, pageNumber }).lean();
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const sections = (page.sections || [])
        .slice()
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((section) => (section?.text || "").trim())
        .filter(Boolean);

      const actionItem = (page.actionItem || "").trim();

      if (sections.length === 0 && !actionItem) {
        return res.status(409).json({ message: "Page has no text yet" });
      }

      const pageTitle = (page.title || "").trim() || `Page ${pageNumber}`;
      const actionItemText = actionItem ? `Action item. ${actionItem}` : "";
      const aggregated = `${pageTitle}. ${sections.join(" ")} ${actionItemText}`.trim();
      const language = book.language === "Hindi" ? "Hindi" : "English";
      const ttsPayload = {
        text: aggregated,
        language,
      };
      const aiBaseUrl = process.env.AI_LAYER_URL || "http://localhost:8000";
      const aiResponse = await fetch(`${aiBaseUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ttsPayload)
      });

      if (!aiResponse.ok) {
        const detail = await aiResponse.text();
        const lowered = detail.toLowerCase();
        const isRateLimited =
          aiResponse.status === 429 ||
          lowered.includes("rate limit") ||
          lowered.includes("rate_limit_exceeded") ||
          lowered.includes("tokens per day") ||
          lowered.includes("free tier");

        if (isRateLimited) {
          return res.status(429).json({ message: "Free Tier Expired. Request Upgrade!" });
        }

        return res.status(502).json({ message: "TTS upstream failed" });
      }

      const arrayBuffer = await aiResponse.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return res.status(502).json({ message: "TTS upstream returned empty audio" });
      }

      const upstreamType = aiResponse.headers.get("content-type") || "audio/wav";
      res.setHeader("Content-Type", upstreamType);
      res.setHeader("Cache-Control", "no-store");
      return res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:bookId/pages", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, req.auth?.sub);
      if (!record) {
        return res.status(404).json({ message: "Book not found" });
      }

      const book = record.doc.toObject();
      const isSample = record.kind === "sample";

      const pages =
        isSample
          ? await SamplePage.find({ sampleBookId: req.params.bookId }).sort({ pageNumber: 1 }).lean()
          : await Page.find({ bookId: req.params.bookId }).sort({ pageNumber: 1 }).lean();

      if (isSample) {
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
      }

      return res.json({
        book: { ...book, isSample },
        pages,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:bookId/progress", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, req.auth?.sub);
      if (!record) {
        return res.status(404).json({ message: "Book not found" });
      }

      if (record.kind === "sample") {
        return res.json({ tasks: [] });
      }

      const tasks = await GenerationTask.find({ bookId: req.params.bookId }).sort({ createdAt: -1 }).lean();

      return res.json({ tasks });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:bookId", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, req.auth?.sub);
      if (!record) {
        return res.status(404).json({ message: "Book not found" });
      }

      if (record.kind === "sample") {
        return res.status(403).json({ message: "Sample books cannot be deleted." });
      }

      const book = record.doc;

      await Promise.all([
        GenerationTask.deleteMany({ bookId: book._id }),
        Page.deleteMany({ bookId: book._id }),
        Book.deleteOne({ _id: book._id })
      ]);

      io.emit("book:deleted", { bookId: String(book._id) });
      return res.json({ deleted: true, bookId: String(book._id) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
