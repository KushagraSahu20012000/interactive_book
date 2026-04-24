import { getGuestKey } from "@/lib/auth";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("bright_minds_auth_token") || "";
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const guestKey = getGuestKey();
  if (guestKey) {
    headers.set("X-Guest-Key", guestKey);
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers,
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type CreateBookPayload = {
  topic: string;
  description?: string;
  ageGroup: "5-10" | "10-15" | "15-20" | "20+";
  neurotype: "ADHD" | "Dyslexia" | "Autism" | "None";
  language: "English" | "Hindi";
};

export function listBooks() {
  return request<{ books: Array<any> }>("/api/books");
}

export function createBook(payload: CreateBookPayload) {
  return request<{ bookId: string; pageId: string; aiJobId: string }>("/api/books", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getBookPage(bookId: string, pageNumber?: number) {
  const query = pageNumber ? `?pageNumber=${pageNumber}` : "";
  return request<{ book: any; page: any | null }>(`/api/books/${bookId}${query}`);
}

export function requestNextPage(bookId: string, fromPageNumber?: number) {
  return request<{ pageId: string; pageNumber: number; aiJobId: string; reused?: boolean }>(`/api/books/${bookId}/next`, {
    method: "POST",
    body: JSON.stringify({ fromPageNumber })
  });
}

export function deleteBook(bookId: string) {
  return request<{ deleted: boolean; bookId: string }>(`/api/books/${bookId}`, {
    method: "DELETE"
  });
}

export function getPageAudioUrl(bookId: string, pageNumber: number) {
  return `${BACKEND_URL}/api/books/${bookId}/pages/${pageNumber}/audio`;
}

export type UpgradeRequestPayload = {
  wantsBetterContent: boolean;
  wantsAiGeneratedImages: boolean;
  willingToPayPerBook: number;
  message?: string;
};

export type SuggestionPayload = {
  category: string;
  suggestion: string;
};

export function submitUpgradeRequest(payload: UpgradeRequestPayload) {
  return request<{ ok: boolean; id: string }>("/api/feedback/upgrade-request", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function submitSuggestion(payload: SuggestionPayload) {
  return request<{ ok: boolean; id: string }>("/api/feedback/suggestion", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type AuthPayload = {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    dateOfBirth: string;
    authProvider: "local" | "google";
    emailHash: string;
  };
};

export function registerUser(payload: { name: string; email: string; dateOfBirth: string; password: string }) {
  return request<AuthPayload>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginUser(payload: { email: string; password: string }) {
  return request<AuthPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginWithGoogle(idToken: string) {
  return request<AuthPayload>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken })
  });
}
