export type Phase = "idle" | "negotiating" | "connected" | "disconnected";

// Normalize various RTC connection states into simplified phases used by UI
export function mapPhase(state?: string): Phase {
  if (!state) return "idle";
  if (state === "new" || state === "connecting") return "negotiating";
  if (state === "connected") return "connected";
  if (state === "disconnected" || state === "failed" || state === "closed")
    return "disconnected";
  // Already normalized values from store
  if (
    state === "idle" ||
    (state as any) === "negotiating" ||
    (state as any) === "disconnected"
  )
    return state as Phase;
  return "idle";
}

