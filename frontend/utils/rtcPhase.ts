import type { WebRTCLifecycleState } from "@/types/webrtcLifecycle";

export type Phase = "idle" | "negotiating" | "connected" | "disconnected";

// Normalize various RTC connection states into simplified phases used by UI
export function mapPhase(
  state?: string | WebRTCLifecycleState | null
): Phase {
  if (!state) return "idle";
  if (
    state === "new" ||
    state === "connecting" ||
    state === "joining" ||
    state === "waiting_for_peer" ||
    state === "negotiating"
  ) {
    return "negotiating";
  }
  if (state === "connected") return "connected";
  if (
    state === "disconnected" ||
    state === "failed" ||
    state === "closed" ||
    state === "reconnecting"
  ) {
    return "disconnected";
  }
  // Already normalized values from store
  if (state === "idle" || state === "leaving") return "idle";
  return "idle";
}
