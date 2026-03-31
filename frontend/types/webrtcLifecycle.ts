export type WebRTCLifecycleState =
  | "idle"
  | "joining"
  | "waiting_for_peer"
  | "negotiating"
  | "connected"
  | "reconnecting"
  | "leaving"
  | "failed";

export type WebRTCConnectionBadgeState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export function mapLifecycleToConnectionBadgeState(
  state: WebRTCLifecycleState
): WebRTCConnectionBadgeState {
  switch (state) {
    case "joining":
    case "waiting_for_peer":
    case "negotiating":
      return "connecting";
    case "connected":
      return "connected";
    case "reconnecting":
      return "disconnected";
    case "failed":
      return "failed";
    case "leaving":
    case "idle":
    default:
      return "idle";
  }
}
