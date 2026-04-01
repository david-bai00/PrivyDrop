import type { BaseWebRTCLifecycleEvent } from "@/lib/webrtc_base";
import type { WebRTCLifecycleState } from "@/types/webrtcLifecycle";

export type NormalizedRtcConnectionState =
  | "idle"
  | "negotiating"
  | "connected"
  | "disconnected"
  | "failed";

export function normalizeRtcConnectionState(
  state: RTCPeerConnectionState
): NormalizedRtcConnectionState {
  if (state === "connected") {
    return "connected";
  }

  if (state === "new" || state === "connecting") {
    return "negotiating";
  }

  if (state === "failed") {
    return "failed";
  }

  if (state === "closed" || state === "disconnected") {
    return "disconnected";
  }

  return "idle";
}

export function resolveLifecycleStateFromPeerEvent(
  event: BaseWebRTCLifecycleEvent,
  peerConnectionCount: number
): WebRTCLifecycleState {
  switch (event.type) {
    case "join_started":
      return "joining";
    case "join_succeeded":
    case "reconnect_succeeded":
      return peerConnectionCount > 0 ? "negotiating" : "waiting_for_peer";
    case "reconnect_started":
      return "reconnecting";
    case "join_failed":
    case "reconnect_failed":
      return "failed";
    case "leave_started":
      return "leaving";
    case "leave_completed":
      return "idle";
    default:
      return "idle";
  }
}

export function shouldTransitionToReconnecting(
  currentState: WebRTCLifecycleState
): boolean {
  return currentState !== "leaving";
}
