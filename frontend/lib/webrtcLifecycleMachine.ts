import type { BaseWebRTCLifecycleEvent } from "@/lib/webrtc_base";
import type { WebRTCLifecycleState } from "@/types/webrtcLifecycle";

export type NormalizedRtcConnectionState =
  | "idle"
  | "negotiating"
  | "connected"
  | "disconnected"
  | "failed";

export interface LifecyclePeerConnectionSummary {
  totalCount: number;
  connectedCount: number;
  negotiatingCount: number;
  disconnectedCount: number;
  failedCount: number;
  idleCount: number;
}

export interface LifecyclePeerSnapshot {
  currentState: WebRTCLifecycleState;
  inRoom: boolean;
  peerSummary: LifecyclePeerConnectionSummary;
}

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
  return (
    currentState === "connected" ||
    currentState === "negotiating" ||
    currentState === "reconnecting"
  );
}

export function summarizePeerConnectionStates(
  states: ReadonlyArray<NormalizedRtcConnectionState>
): LifecyclePeerConnectionSummary {
  const summary: LifecyclePeerConnectionSummary = {
    totalCount: 0,
    connectedCount: 0,
    negotiatingCount: 0,
    disconnectedCount: 0,
    failedCount: 0,
    idleCount: 0,
  };

  for (const state of states) {
    summary.totalCount += 1;

    switch (state) {
      case "connected":
        summary.connectedCount += 1;
        break;
      case "negotiating":
        summary.negotiatingCount += 1;
        break;
      case "disconnected":
        summary.disconnectedCount += 1;
        break;
      case "failed":
        summary.failedCount += 1;
        break;
      case "idle":
      default:
        summary.idleCount += 1;
        break;
    }
  }

  return summary;
}

export function resolveLifecycleStateFromPeerSnapshot({
  currentState,
  inRoom,
  peerSummary,
}: LifecyclePeerSnapshot): WebRTCLifecycleState {
  if (currentState === "failed" || currentState === "leaving") {
    return currentState;
  }

  if (peerSummary.connectedCount > 0) {
    return "connected";
  }

  if (currentState === "reconnecting") {
    return inRoom ? "reconnecting" : "idle";
  }

  if (peerSummary.negotiatingCount > 0) {
    return inRoom ? "negotiating" : "idle";
  }

  if (currentState === "joining" && !inRoom) {
    return "joining";
  }

  return inRoom ? "waiting_for_peer" : "idle";
}

export function resolveLifecycleStateAfterDisconnect({
  currentState,
  inRoom,
  peerSummary,
}: LifecyclePeerSnapshot): WebRTCLifecycleState {
  if (currentState === "failed" || currentState === "leaving") {
    return currentState;
  }

  if (peerSummary.connectedCount > 0) {
    return "connected";
  }

  if (peerSummary.negotiatingCount > 0) {
    return shouldTransitionToReconnecting(currentState)
      ? "reconnecting"
      : "negotiating";
  }

  if (inRoom && shouldTransitionToReconnecting(currentState)) {
    return "reconnecting";
  }

  return inRoom ? "waiting_for_peer" : "idle";
}
