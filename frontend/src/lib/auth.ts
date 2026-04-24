const AUTH_TOKEN_KEY = "bright_minds_auth_token";
const AUTH_USER_KEY = "bright_minds_auth_user";
const GUEST_KEY = "bright_minds_guest_key";
const AUTH_STATE_EVENT = "bright-minds-auth-state-change";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  dateOfBirth: string;
  authProvider: "local" | "google";
  emailHash: string;
};

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

export function getGuestKey() {
  return localStorage.getItem(GUEST_KEY) || "";
}

export function hasGuestSession() {
  return Boolean(getGuestKey());
}

export function hasActiveSession() {
  return isAuthenticated() || hasGuestSession();
}

export function getOrCreateGuestKey() {
  const existing = getGuestKey();
  if (existing) {
    return existing;
  }

  const nextKey = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(GUEST_KEY, nextKey);
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
  return nextKey;
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(GUEST_KEY);
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}

export function subscribeAuthStateChange(listener: () => void) {
  window.addEventListener(AUTH_STATE_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(AUTH_STATE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
