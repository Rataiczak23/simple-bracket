"use client";

// Admin tokens are stored per-tournament in localStorage so a host can return
// to the manage page without re-pasting the token. The token also travels in
// the URL hash (#token=) which is never sent to the server.

const key = (id: string) => `sb-admin-${id}`;

export function rememberAdminToken(id: string, token: string) {
  try {
    localStorage.setItem(key(id), token);
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
}

export function getStoredAdminToken(id: string): string | null {
  try {
    return localStorage.getItem(key(id));
  } catch {
    return null;
  }
}

/** Resolve the admin token from the URL hash first, then localStorage. */
export function resolveAdminToken(id: string): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  const match = hash.match(/token=([^&]+)/);
  if (match) {
    const token = decodeURIComponent(match[1]);
    rememberAdminToken(id, token);
    return token;
  }
  return getStoredAdminToken(id);
}
