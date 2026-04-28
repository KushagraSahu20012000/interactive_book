#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import pptxgen from "pptxgenjs";
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

const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const SLIDE_MARGIN_X = 0.45;
const HEADER_Y = 0.22;
const HEADER_H = 0.88;
const CONTENT_Y = 1.28;
const ROW_GAP = 0.18;
const PAGE_BADGE_W = 1.15;
const SECTION_BACKGROUNDS = ["FFD84A", "7DD3FC", "A3E635"];
const TEXT_COLORS_5_TO_10 = ["FF0F7B", "FF5A1F", "5B2CA0"];
const TEXT_COLORS_10_TO_15 = ["A63A65", "A34F2B", "4A2F79"];
const TEXT_COLORS_15_TO_20 = ["A63A65", "A34F2B", "4A2F79"];
const TEXT_COLOR_20_PLUS = ["000000", "000000", "000000"];
const PAPER_BG = "F7F1E5";
const HEADER_BG = "A3E635";
const CARD_BG = "FFFDF8";
const BLACK = "000000";
const PRIMARY_PINK = "F43F7A";
const BORDER_WIDTH = 2.5;
const SHADOW_OFFSET = 0.08;

function printUsage() {
  console.log(`
Export a Bright Minds book to PowerPoint.

Usage:
  npm run export:ppt -- --book-id <mongo-id> [--out <file>]
  npm run export:ppt -- --sample-id <mongo-id> [--out <file>]
  npm run export:ppt -- --sample-slug <slug> [--out <file>]

Examples:
  npm run export:ppt -- --book-id 662dd313a1b4d7b3ef1d8f21
  npm run export:ppt -- --sample-slug non-duality-for-10-15 --out ../exports/non-duality-10-15.pptx
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

function resolveOutputPath(options, book) {
  if (options.outPath) {
    return path.resolve(process.cwd(), options.outPath);
  }

  const exportsDir = path.resolve(process.cwd(), "exports");
  return path.join(exportsDir, `${slugifySegment(book.title)}.pptx`);
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
    return { book, pages };
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
  return { book: sampleBook, pages };
}

function decodeDataUri(url) {
  const match = String(url).match(/^data:(?<mime>[^;,]+)?(?<encoding>;base64)?,(?<payload>.*)$/i);
  if (!match?.groups?.payload) {
    return null;
  }

  const mime = match.groups.mime || "image/png";
  const payload = match.groups.payload;
  const buffer = match.groups.encoding
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return { mime, buffer };
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

  return png;
}

function mimeFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  return "image/png";
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

async function resolveImageData(image, sampleAssetsRoot) {
  const normalizedUrl = String(image?.imageUrl || "").trim();

  if (normalizedUrl) {
    if (/^data:/i.test(normalizedUrl)) {
      const dataUri = decodeDataUri(normalizedUrl);
      if (dataUri) {
        return `data:${dataUri.mime};base64,${dataUri.buffer.toString("base64")}`;
      }
    }

    const localPath = resolveLocalAssetPath(normalizedUrl, sampleAssetsRoot);
    if (localPath) {
      try {
        const buffer = await fs.readFile(localPath);
        return `data:${mimeFromPath(localPath)};base64,${buffer.toString("base64")}`;
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
    }

    if (/^https?:/i.test(normalizedUrl)) {
      const response = await fetch(normalizedUrl);
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "image/png";
        const buffer = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${buffer.toString("base64")}`;
      }
    }
  }

  const png = pixelArrayToPngBuffer(image?.imagePixelArray);
  if (!png) {
    return "";
  }

  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

function getTextColors(ageGroup) {
  const normalizedAge = String(ageGroup || "").trim();
  if (normalizedAge === "20+") {
    return TEXT_COLOR_20_PLUS;
  }
  if (normalizedAge === "15-20") {
    return TEXT_COLORS_15_TO_20;
  }
  if (normalizedAge === "5-10") {
    return TEXT_COLORS_5_TO_10;
  }
  return TEXT_COLORS_10_TO_15;
}

function getBodyFontSize(text) {
  const length = String(text || "").length;
  if (length > 460) {
    return 10.5;
  }
  if (length > 320) {
    return 12;
  }
  if (length > 220) {
    return 13.5;
  }
  return 15;
}

function getTitleFontSize(title) {
  const length = String(title || "").length;
  if (length > 56) {
    return 18;
  }
  if (length > 32) {
    return 21;
  }
  return 24;
}

function addShadowedCard(slide, x, y, w, h, fillColor) {
  slide.addShape("rect", {
    x: x + SHADOW_OFFSET,
    y: y + SHADOW_OFFSET,
    w,
    h,
    line: { color: BLACK, width: 0 },
    fill: { color: BLACK },
  });

  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    line: { color: BLACK, width: BORDER_WIDTH },
    fill: { color: fillColor },
  });
}

function addHeader(slide, book, page) {
  addShadowedCard(slide, SLIDE_MARGIN_X, HEADER_Y, SLIDE_WIDTH - SLIDE_MARGIN_X * 2, HEADER_H, HEADER_BG);

  const title = String(page?.title || `Page ${page?.pageNumber || ""}`).trim() || `Page ${page?.pageNumber || ""}`;
  slide.addText(title.toUpperCase(), {
    x: SLIDE_MARGIN_X + 0.3,
    y: HEADER_Y + 0.16,
    w: SLIDE_WIDTH - SLIDE_MARGIN_X * 2 - 0.6,
    h: 0.3,
    fontFace: "Arial Black",
    bold: true,
    fontSize: getTitleFontSize(title),
    color: BLACK,
    align: "center",
    margin: 0,
    valign: "mid",
  });

  slide.addText(String(book.title || "").toUpperCase(), {
    x: SLIDE_MARGIN_X + 0.4,
    y: HEADER_Y + 0.56,
    w: SLIDE_WIDTH - SLIDE_MARGIN_X * 2 - 0.8,
    h: 0.16,
    fontFace: "Arial",
    bold: true,
    fontSize: 9.5,
    color: BLACK,
    align: "center",
    margin: 0,
    valign: "mid",
  });
}

function addPageBadge(slide, pageNumber) {
  const x = SLIDE_WIDTH - SLIDE_MARGIN_X - PAGE_BADGE_W;
  const y = SLIDE_HEIGHT - 0.55;
  addShadowedCard(slide, x, y, PAGE_BADGE_W, 0.34, CARD_BG);
  slide.addText(`PAGE ${pageNumber}`, {
    x,
    y: y + 0.07,
    w: PAGE_BADGE_W,
    h: 0.14,
    fontFace: "Arial Black",
    bold: true,
    fontSize: 8.5,
    color: BLACK,
    align: "center",
    margin: 0,
    valign: "mid",
  });
}

async function addSectionRow(slide, section, rowIndex, layout, textColor, sampleAssetsRoot) {
  const imageOnLeft = rowIndex % 2 === 0;
  const rowY = layout.contentY + rowIndex * (layout.rowHeight + ROW_GAP);
  const sectionX = SLIDE_MARGIN_X;
  const cardWidth = (SLIDE_WIDTH - SLIDE_MARGIN_X * 2 - 0.26) / 2;
  const secondCardX = sectionX + cardWidth + 0.26;
  const imageX = imageOnLeft ? sectionX : secondCardX;
  const textX = imageOnLeft ? secondCardX : sectionX;
  const backgroundColor = SECTION_BACKGROUNDS[rowIndex % SECTION_BACKGROUNDS.length];
  const sectionText = String(section?.text || "").trim() || "Generating section text...";
  const bodyFontSize = getBodyFontSize(sectionText);

  addShadowedCard(slide, imageX, rowY, cardWidth, layout.rowHeight, backgroundColor);
  addShadowedCard(slide, textX, rowY, cardWidth, layout.rowHeight, CARD_BG);

  const imageData = await resolveImageData(section, sampleAssetsRoot);
  if (imageData) {
    slide.addImage({
      data: imageData,
      x: imageX + 0.1,
      y: rowY + 0.1,
      w: cardWidth - 0.2,
      h: layout.rowHeight - 0.2,
    });
  } else {
    slide.addText(String(section?.imagePrompt || "Generating...").trim() || "Generating...", {
      x: imageX + 0.16,
      y: rowY + 0.18,
      w: cardWidth - 0.32,
      h: layout.rowHeight - 0.36,
      fontFace: "Arial Black",
      bold: true,
      fontSize: 12,
      color: BLACK,
      align: "center",
      valign: "mid",
      margin: 0.02,
    });
  }

  slide.addText(sectionText, {
    x: textX + 0.18,
    y: rowY + 0.14,
    w: cardWidth - 0.36,
    h: layout.rowHeight - 0.28,
    fontFace: "Arial",
    bold: true,
    fontSize: bodyFontSize,
    color: textColor,
    breakLine: false,
    margin: 0.02,
    valign: "mid",
    align: "left",
    fit: "shrink",
  });
}

function addActionItem(slide, actionItem) {
  const boxY = 6.42;
  const boxH = 0.46;
  addShadowedCard(slide, SLIDE_MARGIN_X, boxY, SLIDE_WIDTH - SLIDE_MARGIN_X * 2 - PAGE_BADGE_W - 0.2, boxH, CARD_BG);
  slide.addText([
    { text: "ACTION ITEM: ", options: { bold: true, color: BLACK } },
    { text: actionItem, options: { bold: true, color: BLACK } },
  ], {
    x: SLIDE_MARGIN_X + 0.16,
    y: boxY + 0.11,
    w: SLIDE_WIDTH - SLIDE_MARGIN_X * 2 - PAGE_BADGE_W - 0.52,
    h: 0.2,
    fontFace: "Arial",
    fontSize: 10.5,
    margin: 0,
    fit: "shrink",
    valign: "mid",
  });
}

function getSlideLayout(page) {
  const hasActionItem = Boolean(String(page?.actionItem || "").trim());
  if (hasActionItem) {
    return { contentY: CONTENT_Y, rowHeight: 1.54 };
  }
  return { contentY: CONTENT_Y, rowHeight: 1.72 };
}

function normalizeSections(page) {
  const sections = [...(page?.sections || [])]
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .slice(0, 3);

  while (sections.length < 3) {
    sections.push({
      position: sections.length + 1,
      text: "",
      imagePrompt: "",
      imageUrl: "",
      imagePixelArray: [],
    });
  }

  return sections;
}

async function writePresentation(outputPath, payload, sampleAssetsRoot) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const presentation = new pptxgen();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Bright Minds";
  presentation.company = "Bright Minds";
  presentation.subject = payload.book.topic || "Interactive Book";
  presentation.title = payload.book.title || "Untitled book";
  presentation.lang = "en-US";
  presentation.theme = {
    headFontFace: "Arial Black",
    bodyFontFace: "Arial",
    lang: "en-US",
  };

  const textColors = getTextColors(payload.book.ageGroup);
  for (const page of payload.pages) {
    const slide = presentation.addSlide();
    slide.background = { color: PAPER_BG };

    addHeader(slide, payload.book, page);
    const layout = getSlideLayout(page);
    const sections = normalizeSections(page);

    for (let index = 0; index < sections.length; index += 1) {
      await addSectionRow(slide, sections[index], index, layout, textColors[index % textColors.length], sampleAssetsRoot);
    }

    const actionItem = String(page?.actionItem || "").trim();
    if (actionItem) {
      addActionItem(slide, actionItem);
    }

    addPageBadge(slide, page.pageNumber);
  }

  await presentation.writeFile({ fileName: outputPath });
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
  await writePresentation(outputPath, payload, sampleAssetsRoot);
  console.log(`[ppt-export] wrote ${payload.pages.length} slides to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error("[ppt-export] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });