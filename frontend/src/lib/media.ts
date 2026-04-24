const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export function resolveMediaUrl(url?: string | null) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }

  if (/^(?:https?:|data:|blob:)/i.test(value)) {
    return value;
  }

  return new URL(value, BACKEND_URL).toString();
}