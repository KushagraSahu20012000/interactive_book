import fs from "node:fs/promises";
import path from "node:path";
import { SampleBook } from "../models/SampleBook.js";
import { SamplePage } from "../models/SamplePage.js";

const SAMPLE_BOOK_CONFIGS = [
  {
    slug: "environment-for-5-10",
    directory: "environment - 5-10",
    topic: "Environment",
    description: "Creator-curated sample book demonstrating ideal output quality.",
    ageGroup: "5-10",
    neurotype: "None",
    language: "English",
    title: "Environment for 5-10"
  },
  {
    slug: "non-duality-for-10-15",
    directory: "Non-Duality 10-15",
    topic: "Non-Duality",
    description: "Creator-curated sample book exploring non-duality for teen readers.",
    ageGroup: "10-15",
    neurotype: "None",
    language: "English",
    title: "Non-Duality for 10-15"
  }
];
export const SAMPLE_ASSET_BASE_ROUTE = "/sample-assets";

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
    path.resolve(process.cwd(), "../Assets/sample books"),
    path.resolve(process.cwd(), "Assets/sample books"),
    path.resolve(process.cwd(), "../../interactive_book/Assets/sample books")
  ];
}

export async function resolveSampleAssetsRoot() {
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

async function resolveSampleBookAssets(directory) {
  const assetsRoot = await resolveSampleAssetsRoot();
  if (!assetsRoot) {
    return null;
  }

  const sampleRoot = path.join(assetsRoot, directory);
  try {
    await fs.access(sampleRoot);
    return { assetsRoot, sampleRoot };
  } catch {
    return null;
  }
}

function toPublicAssetUrl(assetsRoot, filePath) {
  const encodedPath = path
    .relative(assetsRoot, filePath)
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${SAMPLE_ASSET_BASE_ROUTE}/${encodedPath}`;
}

async function toPublicAssetUrlWithVersion(assetsRoot, filePath) {
  const baseUrl = toPublicAssetUrl(assetsRoot, filePath);
  try {
    const stats = await fs.stat(filePath);
    const version = Math.floor(stats.mtimeMs);
    return `${baseUrl}?v=${version}`;
  } catch {
    return baseUrl;
  }
}

export async function seedSampleBooksFromAssets() {
  const assetsRoot = await resolveSampleAssetsRoot();
  if (!assetsRoot) {
    console.warn("[sample-seed] Assets folder not found; skipping sample-book seed.");
    return;
  }

  for (const sampleConfig of SAMPLE_BOOK_CONFIGS) {
    const resolvedAssets = await resolveSampleBookAssets(sampleConfig.directory);
    if (!resolvedAssets) {
      console.warn(`[sample-seed] Missing sample folder \"${sampleConfig.directory}\"; skipping.`);
      continue;
    }

    const { sampleRoot } = resolvedAssets;

    const titleImagePath = await findFirstExistingFile(sampleRoot, [
      "title image.png",
      "title image.jpg",
      "title image.jpeg",
      "title image.webp"
    ]);
    const coverImageUrl = titleImagePath ? await toPublicAssetUrlWithVersion(assetsRoot, titleImagePath) : "";

    const sampleBook = await SampleBook.findOneAndUpdate(
      { slug: sampleConfig.slug },
      {
        slug: sampleConfig.slug,
        topic: sampleConfig.topic,
        description: sampleConfig.description,
        ageGroup: sampleConfig.ageGroup,
        neurotype: sampleConfig.neurotype,
        language: sampleConfig.language,
        title: sampleConfig.title,
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

      let rawText = "";
      try {
        rawText = await fs.readFile(sectionPath, "utf-8");
      } catch {
        console.warn(`[sample-seed] Missing section text for ${sampleConfig.slug} page ${pageNumber}; skipping page.`);
        continue;
      }

      const { title, section1, section2, section3 } = parseSectionText(rawText);

      const image1Path = await findFirstExistingFile(pageDir, ["image 1.png", "image 1.jpg", "image 1.jpeg", "image 1.webp"]);
      const image2Path = await findFirstExistingFile(pageDir, ["image 2.png", "image 2.jpg", "image 2.jpeg", "image 2.webp"]);
      const image3Path = await findFirstExistingFile(pageDir, ["image 3.png", "image 3.jpg", "image 3.jpeg", "image 3.webp"]);

      const image1Url = image1Path ? await toPublicAssetUrlWithVersion(assetsRoot, image1Path) : "";
      const image2Url = image2Path ? await toPublicAssetUrlWithVersion(assetsRoot, image2Path) : "";
      const image3Url = image3Path ? await toPublicAssetUrlWithVersion(assetsRoot, image3Path) : "";

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

    console.log(`[sample-seed] Seeded ${sampleConfig.slug} with ${pagesPayload.length} pages.`);
  }
}
