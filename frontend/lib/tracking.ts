import { setTrackEvent } from "@/app/config/api";

/**
 * First-party, cookie-free funnel analytics.
 *
 * Design constraints (deliberate, do not "simplify" these away):
 * - No third-party analytics. The privacy policy promises zero third-party
 *   integrations, so every byte we collect stays on our own backend.
 * - No cookies and no fingerprinting. The only identifier is a random session
 *   id kept in sessionStorage; it carries no personal data and is never derived
 *   from device characteristics.
 * - Fire and forget. Tracking must never slow down or break a file transfer,
 *   so failures are swallowed and callers never await it.
 */

export type TrackEventName =
  | "visit"
  | "room_join"
  | "share_link_copy"
  | "share_qr_view"
  | "receive_join"
  | "receive_invite_landing"
  | "transfer_start"
  | "transfer_complete"
  | "transfer_fail"
  | "cached_id_use"
  | "secondary_action";

const REF_STORAGE_KEY = "privydrop_first_touch_ref";
const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_STORAGE_KEY = "privydrop_session_id";
const SENT_EVENTS_KEY = "privydrop_sent_events";

const DIRECT_REF = "direct";

interface StoredRef {
  ref: string;
  at: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Read the `?ref=` query parameter without depending on the router. */
export function readRefFromLocation(): string | null {
  if (!isBrowser()) return null;
  try {
    const value = new URLSearchParams(window.location.search).get("ref");
    return value ? value.slice(0, 64) : null;
  } catch {
    return null;
  }
}

/**
 * First-touch attribution: the first `?ref=` a visitor ever sees is remembered
 * for 30 days, so later funnel steps can be credited back to the channel that
 * acquired them.
 */
export function captureFirstTouchRef(): string {
  if (!isBrowser()) return DIRECT_REF;
  try {
    const fromUrl = readRefFromLocation();
    if (fromUrl) {
      const payload: StoredRef = { ref: fromUrl, at: Date.now() };
      window.localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(payload));
      return fromUrl;
    }

    const raw = window.localStorage.getItem(REF_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredRef;
      if (parsed?.ref && Date.now() - parsed.at < REF_TTL_MS) {
        return parsed.ref;
      }
    }
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Ignore.
  }
  return DIRECT_REF;
}

function randomId(): string {
  if (isBrowser() && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable per-browser-session id, stored locally and never sent as PII. */
export function getSessionId(): string {
  if (!isBrowser()) return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = randomId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

/**
 * At most one emission of a given event per session. Without this, socket
 * reconnects and React re-renders would inflate the funnel beyond usefulness.
 */
function alreadySentInSession(event: TrackEventName): boolean {
  if (!isBrowser()) return true;
  try {
    const raw = window.sessionStorage.getItem(SENT_EVENTS_KEY);
    const sent = raw ? (JSON.parse(raw) as string[]) : [];
    if (sent.includes(event)) return true;
    window.sessionStorage.setItem(
      SENT_EVENTS_KEY,
      JSON.stringify([...sent, event].slice(-50))
    );
    return false;
  } catch {
    return false;
  }
}

function currentPath(): string {
  if (!isBrowser()) return "/";
  const { pathname } = window.location;
  // Room ids live in the query string precisely so they are never sent here:
  // they are ephemeral secrets shared between two people.
  return pathname.slice(0, 120) || "/";
}

/**
 * Record a funnel step. Never awaited by callers: analytics must not sit in
 * front of the WebRTC connection setup.
 */
export function trackEvent(
  event: TrackEventName,
  options: { dedupe?: boolean; locale?: string } = {}
): void {
  if (!isBrowser()) return;
  if (options.dedupe !== false && alreadySentInSession(event)) return;

  const ref = captureFirstTouchRef();

  void setTrackEvent({
    event,
    ref,
    path: currentPath(),
    locale: options.locale ?? (document.documentElement.lang || "unknown"),
    sid: getSessionId(),
    timestamp: new Date().toISOString(),
  });
}

/** Backwards-compatible entry point used by usePageSetup. */
export const trackReferrer = (): void => {
  trackEvent("visit", { dedupe: true });
};
