#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import { PNG } from "pngjs";
import { connectDB } from "../src/db.js";
import { Book } from "../src/models/Book.js";
import { Page } from "../src/models/Page.js";
import { SampleBook } from "../src/models/SampleBook.js";
import { SamplePage } from "../src/models/SamplePage.js";
import {
  SAMPLE_ASSET_BASE_ROUTE,
  resolveSampleAssetsRoot,
  seedSampleBooksFromAssets,
} from "../src/services/sampleBooksSeeder.js";

const PAGE_SIZE = "A4";
const PAGE_MARGINS = { top: 48, right: 48, bottom: 48, left: 48 };
const SECTION_GAP = 14;
const SECTION_IMAGE_HEIGHT = 150;

function printUsage() {
  console.log(`
Export a Bright Minds book to PDF.

Usage:
  npm run export:pdf -- --book-id <mongo-id> [--out <file>]
  npm run export:pdf -- --sample-id <mongo-id> [--out <file>]
  npm run export:pdf -- --sample-slug <slug> [--out <file>]

Examples:
  npm run export:pdf -- --book-id 662dd313a1b4d7b3ef1d8f21
  npm run export:pdf -- --sample-slug environment-for-5-10 --out ../exports/environment.pdf
`);
}

function parseArgs(argv) {
  const options = {
    help: false,
    bookId: "",
    sampleId: "",
    sampleSlug: "",
    outPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1] || "";

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--book-id" && next) {
      options.bookId = next.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--book-id=")) {
      options.bookId = token.split("=").slice(1).join("=").trim();
      continue;
    }

    if (token === "--sample-id" && next) {
      options.sampleId = next.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--sample-id=")) {
      options.sampleId = token.split("=").slice(1).join("=").trim();
      continue;
    }

    if ((token === "--sample-slug" || token === "--slug") && next) {
      options.sampleSlug = next.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--sample-slug=") || token.startsWith("--slug=")) {
      options.sampleSlug = token.split("=").slice(1).join("=").trim();
      continue;
    }

    if (token === "--out" && next) {
      options.outPath = next.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--out=")) {
      options.outPath = token.split("=").slice(1).join("=").trim();
    }
  }

  return options;
}

function validateOptions(options) {
  const sourceCount = [options.bookId, options.sampleId, options.sampleSlug].filter(Boolean).length;
  if (options.help) {
    return;
  }
  if (sourceCount !== 1) {
    throw new Error("Provide exactly one of --book-id, --sample-id, or --sample-slug.");
  }
}

function slugifySegment(value) {
  return String(value || "book")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "book";
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function resolveOutputPath(options, book) {
  if (options.outPath) {
    return path.resolve(process.cwd(), options.outPath);
  }

  const exportsDir = path.resolve(process.cwd(), "exports");
  const fileName = `${slugifySegment(book.title)}.pdf`;
  return path.join(exportsDir, fileName);
}

async function loadBookPayload(options) {
  if (options.sampleId || options.sampleSlug) {
    await seedSampleBooksFromAssets();
  }

  if (options.bookId) {
    const book = await Book.findById(options.bookId).lean();
    if (!book) {
      throw new Error(`Book not found for id: ${options.bookId}`);
    }

    const pages = await Page.find({ bookId: book._id }).sort({ pageNumber: 1 }).lean();
    return { book, pages, isSample: false };
  }

  let sampleBook = null;
  if (options.sampleId) {
    sampleBook = await SampleBook.findById(options.sampleId).lean();
    if (!sampleBook) {
      throw new Error(`Sample book not found for id: ${options.sampleId}`);
    }
  } else {
    sampleBook = await SampleBook.findOne({ slug: options.sampleSlug }).lean();
    if (!sampleBook) {
      throw new Error(`Sample book not found for slug: ${options.sampleSlug}`);
    }
  }

  const pages = await SamplePage.find({ sampleBookId: sampleBook._id }).sort({ pageNumber: 1 }).lean();
  return { book: sampleBook, pages, isSample: true };
}

function decodeDataUri(url) {
  const match = String(url).match(/^data:(?<mime>[^;,]+)?(?<encoding>;base64)?,(?<payload>.*)$/i);
  if (!match?.groups?.payload) {
    return null;
  }

  const payload = match.groups.payload;
  if (match.groups.encoding) {
    return Buffer.from(payload, "base64");
  }

  return Buffer.from(decodeURIComponent(payload), "utf8");
}

function pixelValueToRgb(value) {
  const numeric = Number(value) || 0;
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
}

function pixelArrayToPngBuffer(pixelArray) {
  const height = Array.isArray(pixelArray) ? pixelArray.length : 0;
  const width = height > 0 && Array.isArray(pixelArray[0]) ? pixelArray[0].length : 0;

  if (!height || !width) {
    return null;
  }

  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixelValueToRgb(pixelArray[y][x]);
      const index = (width * y + x) << 2;
      png.data[index] = red;
      png.data[index + 1] = green;
      png.data[index + 2] = blue;
      png.data[index + 3] = 255;
    }
  }

  return PNG.sync.write(png);
}

function resolveLocalAssetPath(imageUrl, sampleAssetsRoot) {
  const cleanUrl = String(imageUrl || "").trim().split("?")[0];
  if (!cleanUrl) {
    return "";
  }

  if (/^file:/i.test(cleanUrl)) {
    return fileURLToPath(cleanUrl);
  }

  if (path.isAbsolute(cleanUrl)) {
    return cleanUrl;
  }

  if (cleanUrl.startsWith(`${SAMPLE_ASSET_BASE_ROUTE}/`) && sampleAssetsRoot) {
    const relativePath = cleanUrl.slice(SAMPLE_ASSET_BASE_ROUTE.length).replace(/^\/+/, "");
    const segments = relativePath.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    return path.join(sampleAssetsRoot, ...segments);
  }

  return "";
}

async function readLocalFileIfPresent(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function fetchRemoteBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status} for ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function resolveImageBuffer({ imageUrl, imagePixelArray }, sampleAssetsRoot) {
  const normalizedUrl = String(imageUrl || "").trim();
  if (normalizedUrl) {
    if (/^data:/i.test(normalizedUrl)) {
      const dataBuffer = decodeDataUri(normalizedUrl);
      if (dataBuffer) {
        return dataBuffer;
      }
    }

    const localAssetPath = resolveLocalAssetPath(normalizedUrl, sampleAssetsRoot);
    const localBuffer = await readLocalFileIfPresent(localAssetPath);
    if (localBuffer) {
      return localBuffer;
    }

    if (/^https?:/i.test(normalizedUrl)) {
      return fetchRemoteBuffer(normalizedUrl);
    }
  }

  return pixelArrayToPngBuffer(imagePixelArray);
}

function setDocumentMetadata(doc, book) {
  doc.info.Title = book.title || "Untitled book";
  doc.info.Author = "Bright Minds";
  doc.info.Subject = book.topic || "Interactive Book";
  doc.info.Keywords = [book.topic, book.ageGroup, book.neurotype, book.language].filter(Boolean).join(", ");
  doc.info.Creator = "Bright Minds PDF Export Script";
}

function drawMetadataLine(doc, label, value, x, y, width) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#475569").text(`${label}:`, x, y, {
    width,
    continued: true,
  });
  doc.font("Helvetica").fillColor("#0F172A").text(` ${value || "-"}`, { width });
  return doc.y;
}

async function drawCoverPage(doc, book, pages, sampleAssetsRoot) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.page.margins.top;

  doc.roundedRect(doc.page.margins.left, y, pageWidth, 110, 20).fill("#E2E8F0");
  y += 20;
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#0F172A").text(book.title || "Untitled book", doc.page.margins.left + 18, y, {
    width: pageWidth - 36,
  });
  y = doc.y + 8;
  doc.font("Helvetica").fontSize(12).fillColor("#334155").text(book.description || "No description provided.", doc.page.margins.left + 18, y, {
    width: pageWidth - 36,
  });
  y = doc.y + 24;

  y = drawMetadataLine(doc, "Topic", book.topic, doc.page.margins.left, y, pageWidth);
  y = drawMetadataLine(doc, "Age Group", book.ageGroup, doc.page.margins.left, y + 6, pageWidth);
  y = drawMetadataLine(doc, "Neurotype", book.neurotype, doc.page.margins.left, y + 6, pageWidth);
  y = drawMetadataLine(doc, "Language", book.language, doc.page.margins.left, y + 6, pageWidth);
  y = drawMetadataLine(doc, "Pages Exported", String(pages.length), doc.page.margins.left, y + 6, pageWidth);
  y = drawMetadataLine(doc, "Exported On", formatDate(new Date()), doc.page.margins.left, y + 6, pageWidth);
  y += 18;

  try {
    const coverBuffer = await resolveImageBuffer(
      {
        imageUrl: book.coverImageUrl,
        imagePixelArray: book.coverImagePixelArray,
      },
      sampleAssetsRoot
    );
    if (coverBuffer) {
      doc.image(coverBuffer, doc.page.margins.left, y, {
        fit: [pageWidth, 330],
        align: "center",
        valign: "center",
      });
      y += 342;
    }
  } catch (error) {
    console.warn(`[pdf-export] skipped cover image: ${error.message}`);
  }

  doc.font("Helvetica-Oblique").fontSize(10).fillColor("#64748B").text(
    "Generated by the Bright Minds backend PDF exporter.",
    doc.page.margins.left,
    Math.min(y + 8, doc.page.height - doc.page.margins.bottom - 20),
    { width: pageWidth }
  );
}

function drawPageHeader(doc, book, page, continued = false) {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.page.margins.top;

  doc.font("Helvetica").fontSize(10).fillColor("#64748B").text(book.title || "Untitled book", x, y, { width });
  y = doc.y + 6;
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#0F172A").text(
    `${page.pageNumber}. ${page.title || `Page ${page.pageNumber}`}${continued ? " (continued)" : ""}`,
    x,
    y,
    { width }
  );
  y = doc.y + 14;
  return y;
}

function ensureSpace(doc, currentY, requiredHeight, redrawHeader) {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (currentY + requiredHeight <= pageBottom) {
    return currentY;
  }

  doc.addPage();
  return redrawHeader(true);
}

function normalizeSections(page) {
  return [...(page.sections || [])]
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .filter((section) => {
      const hasText = String(section.text || "").trim().length > 0;
      const hasImage = String(section.imageUrl || "").trim().length > 0 || (section.imagePixelArray || []).length > 0;
      return hasText || hasImage;
    });
}

async function drawSectionCard(doc, section, currentY, sampleAssetsRoot, redrawHeader) {
  const cardX = doc.page.margins.left;
  const cardWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const innerWidth = cardWidth - 24;
  const sectionText = String(section.text || "").trim() || "Image only section";

  let imageBuffer = null;
  try {
    imageBuffer = await resolveImageBuffer(section, sampleAssetsRoot);
  } catch (error) {
    console.warn(`[pdf-export] skipped section image ${section.position}: ${error.message}`);
  }

  doc.font("Helvetica").fontSize(12);
  const textHeight = doc.heightOfString(sectionText, { width: innerWidth, align: "left" });
  const imageHeight = imageBuffer ? SECTION_IMAGE_HEIGHT + 12 : 0;
  const cardHeight = 18 + 18 + imageHeight + textHeight + 18;

  const y = ensureSpace(doc, currentY, cardHeight, redrawHeader);
  doc.save();
  doc.roundedRect(cardX, y, cardWidth, cardHeight, 14).fillAndStroke("#F8FAFC", "#CBD5E1");
  doc.restore();

  let cursorY = y + 12;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#475569").text(`Section ${section.position}`, cardX + 12, cursorY, {
    width: innerWidth,
  });
  cursorY += 22;

  if (imageBuffer) {
    try {
      doc.image(imageBuffer, cardX + 12, cursorY, {
        fit: [innerWidth, SECTION_IMAGE_HEIGHT],
        align: "center",
        valign: "center",
      });
      cursorY += SECTION_IMAGE_HEIGHT + 12;
    } catch (error) {
      console.warn(`[pdf-export] unsupported image skipped for section ${section.position}: ${error.message}`);
    }
  }

  doc.font("Helvetica").fontSize(12).fillColor("#0F172A").text(sectionText, cardX + 12, cursorY, {
    width: innerWidth,
    align: "left",
  });

  return y + cardHeight + SECTION_GAP;
}

async function drawBookPage(doc, book, page, sampleAssetsRoot) {
  const headerRenderer = (continued = false) => drawPageHeader(doc, book, page, continued);
  let y = headerRenderer(false);

  const sections = normalizeSections(page);
  if (!sections.length) {
    doc.font("Helvetica").fontSize(12).fillColor("#475569").text("No section content available for this page.", doc.page.margins.left, y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
    return;
  }

  for (const section of sections) {
    y = await drawSectionCard(doc, section, y, sampleAssetsRoot, headerRenderer);
  }

  const actionItem = String(page.actionItem || "").trim();
  if (actionItem) {
    y = ensureSpace(doc, y, 90, headerRenderer);
    doc.roundedRect(doc.page.margins.left, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 72, 14)
      .fillAndStroke("#EEF2FF", "#C7D2FE");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#4338CA").text("Action Item", doc.page.margins.left + 12, y + 12);
    doc.font("Helvetica").fontSize(12).fillColor("#1E1B4B").text(actionItem, doc.page.margins.left + 12, y + 30, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 24,
    });
  }
}

async function writePdf(outputPath, payload, sampleAssetsRoot) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const doc = new PDFDocument({ size: PAGE_SIZE, margins: PAGE_MARGINS, autoFirstPage: true });
  setDocumentMetadata(doc, payload.book);

  const stream = createWriteStream(outputPath);
  doc.pipe(stream);

  await drawCoverPage(doc, payload.book, payload.pages, sampleAssetsRoot);
  for (const page of payload.pages) {
    doc.addPage();
    await drawBookPage(doc, payload.book, page, sampleAssetsRoot);
  }

  doc.end();
  await once(stream, "finish");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);

  if (options.help) {
    printUsage();
    return;
  }

  await connectDB(process.env.MONGO_URI);
  const sampleAssetsRoot = await resolveSampleAssetsRoot();
  const payload = await loadBookPayload(options);

  if (!payload.pages.length) {
    throw new Error("No pages found for the selected book.");
  }

  const outputPath = resolveOutputPath(options, payload.book);
  await writePdf(outputPath, payload, sampleAssetsRoot);

  console.log(`[pdf-export] wrote ${payload.pages.length} pages to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error("[pdf-export] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });