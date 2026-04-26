import path from "node:path";
import { Router } from "express";
import { Book } from "../models/Book.js";
import { Page } from "../models/Page.js";
import { SampleBook } from "../models/SampleBook.js";
import { SamplePage } from "../models/SamplePage.js";
import { GenerationTask } from "../models/GenerationTask.js";
import { AI_LIMIT_EXCEEDED_FALLBACK_TEXT, submitCreateBookJob, submitNextPageJob, synthesizeSpeech } from "../services/aiClient.js";
import { buildPageAudioNarration, normalizeNarrationLanguage } from "../services/pageAudio.js";
import { findSamplePageAudioAsset } from "../services/sampleBooksSeeder.js";
import { monitorTaskLoop } from "../services/taskMonitor.js";
import { attachAuthOptional, requireAuth } from "../middleware/auth.js";
import { awardBookCreatedPoints, getIdentityFromRequest } from "../services/rewardsService.js";

const AUDIO_CONTENT_TYPE_BY_EXTENSION = new Map([
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".ogg", "audio/ogg"],
  [".webm", "audio/webm"]
]);

function getAudioContentType(filePath) {
  return AUDIO_CONTENT_TYPE_BY_EXTENSION.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

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

      const identityFilter = userId
        ? { userId }
        : { guestKey };

      const existingInProgressBook = await Book.findOne({
        ...identityFilter,
        topic: normalizedTopic,
        ageGroup,
        neurotype,
        language,
        status: { $in: ["queued", "generating"] }
      }).sort({ createdAt: -1 });

      if (existingInProgressBook) {
        const existingLatestPage = await Page.findOne({ bookId: existingInProgressBook._id }).sort({ pageNumber: -1 });
        return res.status(200).json({
          bookId: String(existingInProgressBook._id),
          pageId: existingLatestPage ? String(existingLatestPage._id) : "",
          aiJobId: existingLatestPage?.aiJobId || "",
          reused: true
        });
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

      await awardBookCreatedPoints(getIdentityFromRequest(req), String(book._id));

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
      const record = await getBookRecord(req.params.bookId, getRequesterIdentity(req));
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

      if (isSample) {
        const savedSampleAudio = await findSamplePageAudioAsset(book, pageNumber);
        if (savedSampleAudio?.audioPath) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.type(getAudioContentType(savedSampleAudio.audioPath));
          return res.sendFile(savedSampleAudio.audioPath);
        }
      }

      const aggregated = buildPageAudioNarration(page, pageNumber);
      if (!aggregated) {
        return res.status(409).json({ message: "Page has no text yet" });
      }

      const language = normalizeNarrationLanguage(book.language);
      const ttsPayload = {
        text: aggregated,
        language,
      };

      try {
        const { audioBuffer, contentType } = await synthesizeSpeech(ttsPayload);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-store");
        return res.send(audioBuffer);
      } catch (audioError) {
        if (audioError?.status === 429 || audioError?.message === AI_LIMIT_EXCEEDED_FALLBACK_TEXT) {
          return res.status(429).json({ message: "Free Tier Expired. Request Upgrade!" });
        }

        if (audioError?.message === "TTS upstream returned empty audio") {
          return res.status(502).json({ message: "TTS upstream returned empty audio" });
        }

        return res.status(502).json({ message: "TTS upstream failed" });
      }
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:bookId/pages", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, getRequesterIdentity(req));
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

  router.patch("/:bookId/pages/:pageNumber", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, getRequesterIdentity(req));
      if (!record) {
        return res.status(404).json({ message: "Book not found" });
      }

      if (record.kind === "sample") {
        return res.status(403).json({ message: "Sample books cannot be edited." });
      }

      const pageNumber = Number(req.params.pageNumber);
      if (!pageNumber || pageNumber < 1) {
        return res.status(400).json({ message: "Valid pageNumber is required." });
      }

      const rawSections = Array.isArray(req.body?.sections) ? req.body.sections : null;
      if (!rawSections) {
        return res.status(400).json({ message: "sections array is required." });
      }

      const page = await Page.findOne({ bookId: req.params.bookId, pageNumber });
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const nextSectionTextByPosition = new Map();
      for (const section of rawSections) {
        const position = Number(section?.position);
        if (!position || position < 1) {
          return res.status(400).json({ message: "Each section requires a valid position." });
        }
        nextSectionTextByPosition.set(position, typeof section?.text === "string" ? section.text : "");
      }

      page.sections = (page.sections || []).map((section) => ({
        ...section.toObject(),
        text: nextSectionTextByPosition.has(section.position)
          ? String(nextSectionTextByPosition.get(section.position) || "")
          : section.text,
      }));

      await page.save();

      return res.json({
        book: record.doc.toObject(),
        page: page.toObject(),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:bookId/progress", async (req, res, next) => {
    try {
      const record = await getBookRecord(req.params.bookId, getRequesterIdentity(req));
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
      const record = await getBookRecord(req.params.bookId, getRequesterIdentity(req));
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
