const AUTH_TOKEN_KEY = "bright_minds_auth_token";
const AUTH_USER_KEY = "bright_minds_auth_user";

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
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
