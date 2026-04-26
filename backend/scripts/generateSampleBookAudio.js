#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { synthesizeSpeech } from "../src/services/aiClient.js";
import { buildPageAudioNarration, normalizeNarrationLanguage } from "../src/services/pageAudio.js";
import {
  SAMPLE_AUDIO_FILE_CANDIDATES,
  SAMPLE_BOOK_CONFIGS,
  parseSectionText,
  resolveSampleBookAssetsBySlug,
} from "../src/services/sampleBooksSeeder.js";

function parseArgs(argv) {
  const args = new Set(argv);
  const bookArg = argv.find((value) => value.startsWith("--book=") || value.startsWith("--slug="));

  return {
    force: args.has("--force"),
    bookSlug: bookArg ? bookArg.split("=").slice(1).join("=").trim() : "",
  };
}

function sortPageEntries(entries) {
  return entries
    .filter((entry) => entry.isDirectory() && /^page\s+\d+$/i.test(entry.name))
    .sort((left, right) => {
      const leftPageNumber = Number(left.name.match(/\d+/)?.[0] || 0);
      const rightPageNumber = Number(right.name.match(/\d+/)?.[0] || 0);
      return leftPageNumber - rightPageNumber;
    });
}

async function findExistingAudioFile(pageDir) {
  for (const candidate of SAMPLE_AUDIO_FILE_CANDIDATES) {
    const filePath = path.join(pageDir, candidate);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // continue
    }
  }
  return null;
}

async function removeExistingAudioFiles(pageDir) {
  for (const candidate of SAMPLE_AUDIO_FILE_CANDIDATES) {
    const filePath = path.join(pageDir, candidate);
    try {
      await fs.rm(filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function getAudioFileName(contentType) {
  const normalizedType = String(contentType || "").toLowerCase();

  if (normalizedType.includes("mpeg") || normalizedType.includes("mp3")) {
    return "audio.mp3";
  }
  if (normalizedType.includes("ogg")) {
    return "audio.ogg";
  }
  if (normalizedType.includes("webm")) {
    return "audio.webm";
  }
  if (normalizedType.includes("mp4") || normalizedType.includes("m4a")) {
    return "audio.m4a";
  }

  return "audio.wav";
}

function buildPagePayload(rawText, pageNumber) {
  const { title, section1, section2, section3 } = parseSectionText(rawText);
  return {
    title,
    actionItem: "",
    sections: [
      { position: 1, text: section1 },
      { position: 2, text: section2 },
      { position: 3, text: section3 },
    ],
    pageNumber,
  };
}

async function generateAudioForPage(config, pageDir, pageNumber, options) {
  const sectionPath = path.join(pageDir, "section_text.txt");
  const rawText = await fs.readFile(sectionPath, "utf-8");
  const pagePayload = buildPagePayload(rawText, pageNumber);
  const narration = buildPageAudioNarration(pagePayload, pageNumber);

  if (!narration) {
    console.warn(`[sample-audio] ${config.slug} page ${pageNumber}: skipped, no narration text.`);
    return { generated: 0, skipped: 1 };
  }

  const existingAudio = await findExistingAudioFile(pageDir);
  if (existingAudio && !options.force) {
    console.log(`[sample-audio] ${config.slug} page ${pageNumber}: kept ${path.basename(existingAudio)}.`);
    return { generated: 0, skipped: 1 };
  }

  const language = normalizeNarrationLanguage(config.language);
  const { audioBuffer, contentType } = await synthesizeSpeech({ text: narration, language });
  const audioFileName = getAudioFileName(contentType);

  await removeExistingAudioFiles(pageDir);
  await fs.writeFile(path.join(pageDir, audioFileName), audioBuffer);
  console.log(`[sample-audio] ${config.slug} page ${pageNumber}: wrote ${audioFileName} via ai.`);

  return { generated: 1, skipped: 0 };
}

async function generateAudioForBook(config, options) {
  const resolvedAssets = await resolveSampleBookAssetsBySlug(config.slug);
  if (!resolvedAssets) {
    throw new Error(`Sample assets not found for ${config.slug}`);
  }

  const entries = await fs.readdir(resolvedAssets.sampleRoot, { withFileTypes: true });
  const pageDirs = sortPageEntries(entries);
  let generated = 0;
  let skipped = 0;

  for (const pageDirEntry of pageDirs) {
    const pageNumber = Number(pageDirEntry.name.match(/\d+/)?.[0] || 0);
    if (!pageNumber) {
      continue;
    }

    const pageDir = path.join(resolvedAssets.sampleRoot, pageDirEntry.name);
    const result = await generateAudioForPage(config, pageDir, pageNumber, options);
    generated += result.generated;
    skipped += result.skipped;
  }

  return { generated, skipped, total: pageDirs.length };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sampleBooks = options.bookSlug
    ? SAMPLE_BOOK_CONFIGS.filter((config) => config.slug === options.bookSlug)
    : SAMPLE_BOOK_CONFIGS;

  if (!sampleBooks.length) {
    throw new Error(`Unknown sample book slug: ${options.bookSlug}`);
  }

  let generated = 0;
  let skipped = 0;

  for (const config of sampleBooks) {
    const result = await generateAudioForBook(config, options);
    generated += result.generated;
    skipped += result.skipped;
    console.log(
      `[sample-audio] ${config.slug}: ${result.generated} generated, ${result.skipped} skipped, ${result.total} total pages.`
    );
  }

  console.log(`[sample-audio] complete: ${generated} generated, ${skipped} skipped.`);
}

main().catch((error) => {
  console.error("[sample-audio] failed", error);
  process.exit(1);
});