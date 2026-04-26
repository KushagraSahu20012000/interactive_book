import { Book } from "../models/Book.js";
import { Page } from "../models/Page.js";
import { GenerationTask } from "../models/GenerationTask.js";
import { getAiJobStatus } from "./aiClient.js";
import { awardBookCompletedPoints, getIdentityFromBook } from "./rewardsService.js";

const SLEEP_MS = Number(process.env.AI_POLL_INTERVAL_MS || 1500);
const AI_LIMIT_EXCEEDED_FALLBACK_TEXT = "Free Tier Expired. Request Upgrade!";

function normalizeFailureMessage(error) {
  const message = String(error?.message || error || "");
  const lowered = message.toLowerCase();
  const isAiLimitExceeded =
    lowered.includes("rate limit") ||
    lowered.includes("rate_limit_exceeded") ||
    lowered.includes("tokens per day") ||
    lowered.includes("free tier");

  return isAiLimitExceeded ? AI_LIMIT_EXCEEDED_FALLBACK_TEXT : message;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applySectionUpdates(page, aiSections = []) {
  const current = [...page.sections];

  for (const incoming of aiSections) {
    const index = current.findIndex((section) => section.position === incoming.position);
    if (index === -1) {
      continue;
    }

    const baseSection = current[index].toObject ? current[index].toObject() : current[index];

    current[index] = {
      ...baseSection,
      text: incoming.text ?? current[index].text,
      imagePrompt: incoming.image_prompt ?? current[index].imagePrompt,
      imageUrl: incoming.image_url ?? current[index].imageUrl,
      imageStatus: incoming.image_status ?? current[index].imageStatus,
      imagePixelArray: incoming.image_pixel_array ?? current[index].imagePixelArray,
      imageWidth: incoming.image_width ?? current[index].imageWidth,
      imageHeight: incoming.image_height ?? current[index].imageHeight
    };
  }

  page.sections = current;
}

export async function monitorTaskLoop(taskId, io) {
  const task = await GenerationTask.findById(taskId);
  if (!task || task.monitorStarted) {
    return;
  }

  task.monitorStarted = true;
  task.status = "monitoring";
  await task.save();

  while (true) {
    const freshTask = await GenerationTask.findById(taskId);
    if (!freshTask) {
      return;
    }

    try {
      const aiStatus = await getAiJobStatus(freshTask.aiJobId);
      const page = await Page.findById(freshTask.pageId);
      const book = await Book.findById(freshTask.bookId);

      if (!page || !book) {
        return;
      }

      if (aiStatus.title && !page.title) {
        page.title = aiStatus.title;
      }

      if (aiStatus.action_item) {
        page.actionItem = aiStatus.action_item;
      }

      if (Array.isArray(aiStatus.sections)) {
        applySectionUpdates(page, aiStatus.sections);
      }

      if (freshTask.taskType === "create_book" && aiStatus.cover) {
        book.title = aiStatus.book_title || book.title;
        book.coverImageUrl = aiStatus.cover.image_url || "";
        book.coverImagePixelArray = aiStatus.cover.pixel_array || [];
        book.coverImageWidth = aiStatus.cover.width || 0;
        book.coverImageHeight = aiStatus.cover.height || 0;
      }

      if (aiStatus.status === "queued" || aiStatus.status === "processing") {
        book.status = "generating";
      }

      if (aiStatus.status === "text_ready") {
        page.status = "text_ready";
        book.status = "generating";
      }

      if (aiStatus.status === "completed") {
        page.status = "completed";
        book.status = "active";
        book.currentPageNumber = Math.max(book.currentPageNumber, page.pageNumber);
        book.totalPagesGenerated = Math.max(book.totalPagesGenerated, page.pageNumber);
        await awardBookCompletedPoints(getIdentityFromBook(book), String(book._id), page.pageNumber);
        freshTask.status = "completed";
      }

      await Promise.all([page.save(), book.save(), freshTask.save()]);

      io.emit("book:updated", {
        bookId: String(book._id),
        pageId: String(page._id),
        status: aiStatus.status
      });

      if (aiStatus.status === "completed") {
        return;
      }
    } catch (error) {
      const failTask = await GenerationTask.findById(taskId);
      if (!failTask) {
        return;
      }

      failTask.status = "failed";
      failTask.lastError = normalizeFailureMessage(error);
      await failTask.save();

      await Book.findByIdAndUpdate(failTask.bookId, {
        status: "failed",
        lastError: failTask.lastError
      });

      await Page.findByIdAndUpdate(failTask.pageId, {
        status: "failed",
        lastError: failTask.lastError
      });

      io.emit("book:failed", {
        bookId: String(failTask.bookId),
        pageId: String(failTask.pageId),
        error: failTask.lastError
      });
      return;
    }

    await sleep(SLEEP_MS);
  }
}
