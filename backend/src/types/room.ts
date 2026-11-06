export interface RoomInfo {
  created_at: number;
}

export interface ReferrerTrack {
  ref: string;
  timestamp: number;
  path: string;
}

/**
 * First-party funnel event. Every field is either an enum-like token or a
 * random session id; nothing here is personally identifiable, which is what
 * lets us keep the "no third party, no PII" promise while still measuring the
 * funnel.
 */
export interface FunnelTrackEvent {
  /** Funnel step, e.g. "visit" / "room_join" / "transfer_complete". */
  event?: string;
  /** First-touch acquisition source ("direct" when there was no ?ref=). */
  ref?: string;
  /** Landing path, always without the query string (room ids are secrets). */
  path?: string;
  /** UI locale, e.g. "en" / "zh". */
  locale?: string;
  /** Random per-browser-session id, not tied to a device or a person. */
  sid?: string;
  timestamp: number | string;
}

export interface LogMessage {
  message: string;
  timestamp: number;
}
