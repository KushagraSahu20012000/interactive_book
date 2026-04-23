import fs from "node:fs/promises";
import path from "node:path";
import { SampleBook } from "../models/SampleBook.js";
import { SamplePage } from "../models/SamplePage.js";

const SAMPLE_SLUG = "environment-for-5-10";

function normalizeTextBlock(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function parseSectionText(raw) {
  const chunks = raw
    .split(/\r?\n\s*\r?\n/g)
    .map((chunk) => normalizeTextBlock(chunk))
    .filter(Boolean);

  return {
    title: chunks[0] || "Untitled",
    section1: chunks[1] || "",
    section2: chunks[2] || "",
    section3: chunks[3] || ""
  };
}

async function fileToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeByExt = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };
  const mime = mimeByExt[ext] || "application/octet-stream";
  const fileBuffer = await fs.readFile(filePath);
  return `data:${mime};base64,${fileBuffer.toString("base64")}`;
}

async function findFirstExistingFile(baseDir, fileNames) {
  for (const name of fileNames) {
    const candidate = path.join(baseDir, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue searching
    }
  }
  return null;
}

function getAssetRootCandidates() {
  return [
    path.resolve(process.cwd(), "../Assets/sample books/environment - 5-10"),
    path.resolve(process.cwd(), "Assets/sample books/environment - 5-10"),
    path.resolve(process.cwd(), "../../interactive_book/Assets/sample books/environment - 5-10")
  ];
}

async function resolveAssetsRoot() {
  const candidates = getAssetRootCandidates();
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return "";
}

export async function seedSampleBooksFromAssets() {
  const sampleRoot = await resolveAssetsRoot();
  if (!sampleRoot) {
    console.warn("[sample-seed] Assets folder not found; skipping sample-book seed.");
    return;
  }

  const titleImagePath = await findFirstExistingFile(sampleRoot, [
    "title image.png",
    "title image.jpg",
    "title image.jpeg",
    "title image.webp"
  ]);
  const coverImageUrl = titleImagePath ? await fileToDataUrl(titleImagePath) : "";

  const sampleBook = await SampleBook.findOneAndUpdate(
    { slug: SAMPLE_SLUG },
    {
      slug: SAMPLE_SLUG,
      topic: "Environment",
      description: "Creator-curated sample book demonstrating ideal output quality.",
      ageGroup: "5-10",
      neurotype: "None",
      language: "English",
      title: "Environment for 5-10",
      status: "active",
      coverImageUrl,
      isSample: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const entries = await fs.readdir(sampleRoot, { withFileTypes: true });
  const pageDirs = entries
    .filter((entry) => entry.isDirectory() && /^page\s+\d+$/i.test(entry.name))
    .sort((a, b) => {
      const an = Number(a.name.match(/\d+/)?.[0] || 0);
      const bn = Number(b.name.match(/\d+/)?.[0] || 0);
      return an - bn;
    });

  const pagesPayload = [];
  for (const dir of pageDirs) {
    const pageNumber = Number(dir.name.match(/\d+/)?.[0] || 0);
    if (!pageNumber) {
      continue;
    }

    const pageDir = path.join(sampleRoot, dir.name);
    const sectionPath = path.join(pageDir, "section_text.txt");
    const rawText = await fs.readFile(sectionPath, "utf-8");
    const { title, section1, section2, section3 } = parseSectionText(rawText);

    const image1Path = await findFirstExistingFile(pageDir, ["image 1.png", "image 1.jpg", "image 1.jpeg", "image 1.webp"]);
    const image2Path = await findFirstExistingFile(pageDir, ["image 2.png", "image 2.jpg", "image 2.jpeg", "image 2.webp"]);
    const image3Path = await findFirstExistingFile(pageDir, ["image 3.png", "image 3.jpg", "image 3.jpeg", "image 3.webp"]);

    const image1Url = image1Path ? await fileToDataUrl(image1Path) : "";
    const image2Url = image2Path ? await fileToDataUrl(image2Path) : "";
    const image3Url = image3Path ? await fileToDataUrl(image3Path) : "";

    pagesPayload.push({
      sampleBookId: sampleBook._id,
      pageNumber,
      title,
      actionItem: "",
      status: "completed",
      sections: [
        { position: 1, text: section1, imagePrompt: "Sample image 1", imageUrl: image1Url, imageStatus: "ready" },
        { position: 2, text: section2, imagePrompt: "Sample image 2", imageUrl: image2Url, imageStatus: "ready" },
        { position: 3, text: section3, imagePrompt: "Sample image 3", imageUrl: image3Url, imageStatus: "ready" }
      ]
    });
  }

  await SamplePage.deleteMany({ sampleBookId: sampleBook._id });
  if (pagesPayload.length) {
    await SamplePage.insertMany(pagesPayload);
  }

  await SampleBook.updateOne(
    { _id: sampleBook._id },
    {
      totalPagesGenerated: pagesPayload.length,
      currentPageNumber: pagesPayload.length ? 1 : 0
    }
  );

  console.log(`[sample-seed] Seeded sample book with ${pagesPayload.length} pages.`);
}
