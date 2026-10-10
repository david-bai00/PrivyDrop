// Utilities to cache a single room ID in browser localStorage
// Works on client only; no-ops on server.

const CACHED_KEY = "pd_cached_room_id_v1";

/**
 * Minimum room ID length that qualifies as a reusable long room ID.
 *
 * Short IDs (4 chars) are one-shot rooms and must not be cached, otherwise a
 * stale short ID would silently prefill the receiver input on every visit.
 */
export const MIN_CACHEABLE_ROOM_ID_LENGTH = 8;

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
    const trimmed = id.trim();
    // Guard the invariant at the only write path so no caller can cache a
    // short one-shot room ID, regardless of what the UI layer allows.
    if (trimmed.length < MIN_CACHEABLE_ROOM_ID_LENGTH) return;
    window.localStorage.setItem(CACHED_KEY, trimmed);
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

