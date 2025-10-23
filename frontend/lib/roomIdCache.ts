// Utilities to cache a single room ID in browser localStorage
// Works on client only; no-ops on server.

const CACHED_KEY = "pd_cached_room_id_v1";

function isClient() {
  return typeof window !== "undefined";
}

export function getCachedId(): string | null {
  if (!isClient()) return null;
  try {
    const v = window.localStorage.getItem(CACHED_KEY);
    return v && v.trim() ? v : null;
  } catch (_) {
    return null;
  }
}

export function setCachedId(id: string): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(CACHED_KEY, id);
  } catch (_) {
    // ignore
  }
}

export function clearCachedId(): void {
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(CACHED_KEY);
  } catch (_) {
    // ignore
  }
}

