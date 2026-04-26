import { RewardProfile } from "../models/RewardProfile.js";
import { SampleReadProgress } from "../models/SampleReadProgress.js";
import { SampleBook } from "../models/SampleBook.js";

const FIRST_SAMPLE_BOOK_POINTS = 50;
const NEXT_SAMPLE_BOOK_POINTS = 20;
const CREATE_BOOK_POINTS = 5;
const COMPLETE_BOOK_POINTS = 10;
const UNLOCK_POINTS = 100;
const MIN_SAMPLE_PAGE_READ_MS = 8000;
const MAX_DWELL_PER_EVENT_MS = 60000;

function sanitizePoints(value) {
  return Math.max(0, Number(value || 0));
}

function buildIdentityFromInput({ userId = "", guestKey = "" }) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedGuestKey = String(guestKey || "").trim();

  if (normalizedUserId) {
    return {
      identityKey: `u:${normalizedUserId}`,
      userId: normalizedUserId,
      guestKey: "",
    };
  }

  if (normalizedGuestKey) {
    return {
      identityKey: `g:${normalizedGuestKey}`,
      userId: "",
      guestKey: normalizedGuestKey,
    };
  }

  return null;
}

export function getIdentityFromRequest(req) {
  const userId = req.auth?.sub ? String(req.auth.sub) : "";
  const guestKey = typeof req.headers["x-guest-key"] === "string" ? String(req.headers["x-guest-key"]) : "";
  return buildIdentityFromInput({ userId, guestKey });
}

export function getIdentityFromBook(book) {
  return buildIdentityFromInput({
    userId: book?.userId ? String(book.userId) : "",
    guestKey: book?.guestKey ? String(book.guestKey) : "",
  });
}

async function getOrCreateProfile(identity) {
  if (!identity) {
    return null;
  }

  const profile = await RewardProfile.findOneAndUpdate(
    { identityKey: identity.identityKey },
    {
      identityKey: identity.identityKey,
      userId: identity.userId || undefined,
      guestKey: identity.guestKey || "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return profile;
}

function toRewardsSnapshot(profile) {
  const points = sanitizePoints(profile?.points);
  return {
    points,
    unlocks: {
      canDownloadPdf: points >= UNLOCK_POINTS,
      canRequestPhysicalCopy: points >= UNLOCK_POINTS,
    },
    progress: {
      pointsToNextUnlock: Math.max(0, UNLOCK_POINTS - points),
      sampleBooksCompletedCount: sanitizePoints(profile?.sampleBooksCompletedCount),
    },
  };
}

export async function getRewardsStatus(identity) {
  if (!identity) {
    return toRewardsSnapshot(null);
  }

  const profile = await getOrCreateProfile(identity);
  return toRewardsSnapshot(profile);
}

function upsertPageProgress(pages, pageNumber, deltaMs) {
  const pageIdx = pages.findIndex((entry) => entry.pageNumber === pageNumber);
  if (pageIdx >= 0) {
    pages[pageIdx].dwellMs = sanitizePoints(pages[pageIdx].dwellMs) + deltaMs;
    return pages[pageIdx].dwellMs;
  }

  pages.push({ pageNumber, dwellMs: deltaMs });
  return deltaMs;
}

export async function recordSamplePageRead({ identity, sampleBookId, pageNumber, dwellMs }) {
  if (!identity) {
    return {
      rewards: await getRewardsStatus(null),
      event: { awardedPoints: 0, reason: "no_identity" },
    };
  }

  const normalizedPageNumber = Number(pageNumber);
  if (!normalizedPageNumber || normalizedPageNumber < 1) {
    return {
      rewards: await getRewardsStatus(identity),
      event: { awardedPoints: 0, reason: "invalid_page" },
    };
  }

  const clampedDwellMs = Math.max(0, Math.min(Number(dwellMs) || 0, MAX_DWELL_PER_EVENT_MS));
  if (!clampedDwellMs) {
    return {
      rewards: await getRewardsStatus(identity),
      event: { awardedPoints: 0, reason: "zero_dwell" },
    };
  }

  const [profile, sampleBook] = await Promise.all([
    getOrCreateProfile(identity),
    SampleBook.findById(sampleBookId).lean(),
  ]);

  if (!profile || !sampleBook) {
    return {
      rewards: toRewardsSnapshot(profile),
      event: { awardedPoints: 0, reason: "sample_not_found" },
    };
  }

  const progress = await SampleReadProgress.findOneAndUpdate(
    { identityKey: identity.identityKey, sampleBookId: String(sampleBookId) },
    {
      identityKey: identity.identityKey,
      userId: identity.userId || undefined,
      guestKey: identity.guestKey || "",
      sampleBookId: String(sampleBookId),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  upsertPageProgress(progress.pages, normalizedPageNumber, clampedDwellMs);

  let awardedPoints = 0;
  let reason = "tracked";

  const qualifiedPages = progress.pages.filter((entry) => sanitizePoints(entry.dwellMs) >= MIN_SAMPLE_PAGE_READ_MS).length;
  const requiredPages = Math.max(1, Number(sampleBook.totalPagesGenerated || 0));

  if (!progress.rewarded && qualifiedPages >= requiredPages) {
    const isFirstSampleBook = sanitizePoints(profile.sampleBooksCompletedCount) === 0;
    awardedPoints = isFirstSampleBook ? FIRST_SAMPLE_BOOK_POINTS : NEXT_SAMPLE_BOOK_POINTS;
    reason = isFirstSampleBook ? "first_sample_book_completed" : "sample_book_completed";

    progress.rewarded = true;
    profile.points = sanitizePoints(profile.points) + awardedPoints;
    profile.sampleBooksCompletedCount = sanitizePoints(profile.sampleBooksCompletedCount) + 1;

    if (!profile.completedSampleBookIds.includes(String(sampleBookId))) {
      profile.completedSampleBookIds.push(String(sampleBookId));
    }
  }

  await Promise.all([progress.save(), profile.save()]);

  return {
    rewards: toRewardsSnapshot(profile),
    event: {
      awardedPoints,
      reason,
      qualifiedPages,
      requiredPages,
      pageQualified: sanitizePoints(progress.pages.find((entry) => entry.pageNumber === normalizedPageNumber)?.dwellMs) >= MIN_SAMPLE_PAGE_READ_MS,
    },
  };
}

export async function awardBookCreatedPoints(identity, bookId) {
  if (!identity || !bookId) {
    return { awardedPoints: 0, reason: "no_identity_or_book" };
  }

  const profile = await getOrCreateProfile(identity);
  if (!profile) {
    return { awardedPoints: 0, reason: "profile_missing" };
  }

  const normalizedBookId = String(bookId);
  if (profile.createAwardedBookIds.includes(normalizedBookId)) {
    return { awardedPoints: 0, reason: "already_awarded" };
  }

  profile.createAwardedBookIds.push(normalizedBookId);
  profile.points = sanitizePoints(profile.points) + CREATE_BOOK_POINTS;
  await profile.save();

  return { awardedPoints: CREATE_BOOK_POINTS, reason: "book_created", rewards: toRewardsSnapshot(profile) };
}

export async function awardBookCompletedPoints(identity, bookId, pageNumber) {
  if (!identity || !bookId || Number(pageNumber) < 10) {
    return { awardedPoints: 0, reason: "not_eligible" };
  }

  const profile = await getOrCreateProfile(identity);
  if (!profile) {
    return { awardedPoints: 0, reason: "profile_missing" };
  }

  const normalizedBookId = String(bookId);
  if (profile.completionAwardedBookIds.includes(normalizedBookId)) {
    return { awardedPoints: 0, reason: "already_awarded" };
  }

  profile.completionAwardedBookIds.push(normalizedBookId);
  profile.points = sanitizePoints(profile.points) + COMPLETE_BOOK_POINTS;
  await profile.save();

  return { awardedPoints: COMPLETE_BOOK_POINTS, reason: "book_completed", rewards: toRewardsSnapshot(profile) };
}
