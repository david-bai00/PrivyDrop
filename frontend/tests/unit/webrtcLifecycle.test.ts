import { describe, expect, it } from "vitest";

import {
  type NormalizedRtcConnectionState,
  normalizeRtcConnectionState,
  resolveLifecycleStateAfterDisconnect,
  resolveLifecycleStateFromPeerEvent,
  resolveLifecycleStateFromPeerSnapshot,
  summarizePeerConnectionStates,
  shouldTransitionToReconnecting,
} from "@/lib/webrtcLifecycleMachine";
import { mapLifecycleToConnectionBadgeState } from "@/types/webrtcLifecycle";

describe("mapLifecycleToConnectionBadgeState", () => {
  it("maps transitional states to connecting", () => {
    expect(mapLifecycleToConnectionBadgeState("joining")).toBe("connecting");
    expect(mapLifecycleToConnectionBadgeState("waiting_for_peer")).toBe(
      "connecting"
    );
    expect(mapLifecycleToConnectionBadgeState("negotiating")).toBe(
      "connecting"
    );
  });

  it("maps reconnecting to disconnected badge", () => {
    expect(mapLifecycleToConnectionBadgeState("reconnecting")).toBe(
      "disconnected"
    );
  });

  it("maps connected, failed, and idle states", () => {
    expect(mapLifecycleToConnectionBadgeState("connected")).toBe("connected");
    expect(mapLifecycleToConnectionBadgeState("failed")).toBe("failed");
    expect(mapLifecycleToConnectionBadgeState("leaving")).toBe("idle");
    expect(mapLifecycleToConnectionBadgeState("idle")).toBe("idle");
  });
});

describe("normalizeRtcConnectionState", () => {
  it("normalizes browser rtc connection states", () => {
    expect(normalizeRtcConnectionState("new")).toBe("negotiating");
    expect(normalizeRtcConnectionState("connecting")).toBe("negotiating");
    expect(normalizeRtcConnectionState("connected")).toBe("connected");
    expect(normalizeRtcConnectionState("failed")).toBe("failed");
    expect(normalizeRtcConnectionState("disconnected")).toBe("disconnected");
    expect(normalizeRtcConnectionState("closed")).toBe("disconnected");
  });
});

describe("resolveLifecycleStateFromPeerEvent", () => {
  it("resolves join and reconnect lifecycle transitions", () => {
    expect(
      resolveLifecycleStateFromPeerEvent(
        { type: "join_started", roomId: "room", isInitiator: true },
        0
      )
    ).toBe("joining");

    expect(
      resolveLifecycleStateFromPeerEvent(
        { type: "join_succeeded", roomId: "room", isInitiator: true },
        0
      )
    ).toBe("waiting_for_peer");

    expect(
      resolveLifecycleStateFromPeerEvent(
        { type: "join_succeeded", roomId: "room", isInitiator: true },
        1
      )
    ).toBe("negotiating");

    expect(
      resolveLifecycleStateFromPeerEvent(
        { type: "reconnect_started", roomId: "room", isInitiator: false },
        0
      )
    ).toBe("reconnecting");

    expect(
      resolveLifecycleStateFromPeerEvent(
        { type: "reconnect_succeeded", roomId: "room", isInitiator: false },
        1
      )
    ).toBe("negotiating");
  });

  it("resolves failure and leave transitions", () => {
    expect(
      resolveLifecycleStateFromPeerEvent(
        {
          type: "join_failed",
          roomId: "room",
          isInitiator: true,
          error: "failed",
        },
        0
      )
    ).toBe("failed");

    expect(
      resolveLifecycleStateFromPeerEvent(
        {
          type: "reconnect_failed",
          roomId: "room",
          isInitiator: false,
          error: "failed",
        },
        0
      )
    ).toBe("failed");

    expect(
      resolveLifecycleStateFromPeerEvent(
        { type: "leave_started", roomId: "room", isInitiator: true },
        0
      )
    ).toBe("leaving");

    expect(
      resolveLifecycleStateFromPeerEvent(
        { type: "leave_completed", roomId: "room", isInitiator: true },
        0
      )
    ).toBe("idle");
  });
});

describe("summarizePeerConnectionStates", () => {
  it("counts mixed peer connection states for aggregation", () => {
    const states: NormalizedRtcConnectionState[] = [
      "connected",
      "connected",
      "negotiating",
      "failed",
      "idle",
    ];

    expect(
      summarizePeerConnectionStates(states)
    ).toEqual({
      totalCount: 5,
      connectedCount: 2,
      negotiatingCount: 1,
      disconnectedCount: 0,
      failedCount: 1,
      idleCount: 1,
    });
  });
});

describe("resolveLifecycleStateFromPeerSnapshot", () => {
  it("keeps waiting_for_peer while in room without active peers", () => {
    expect(
      resolveLifecycleStateFromPeerSnapshot({
        currentState: "waiting_for_peer",
        inRoom: true,
        peerSummary: summarizePeerConnectionStates([]),
      })
    ).toBe("waiting_for_peer");
  });

  it("prefers connected when peers are in mixed connected and negotiating states", () => {
    const states: NormalizedRtcConnectionState[] = [
      "connected",
      "negotiating",
    ];

    expect(
      resolveLifecycleStateFromPeerSnapshot({
        currentState: "negotiating",
        inRoom: true,
        peerSummary: summarizePeerConnectionStates(states),
      })
    ).toBe("connected");
  });

  it("keeps terminal failure until an explicit lifecycle event replaces it", () => {
    const states: NormalizedRtcConnectionState[] = ["connected"];

    expect(
      resolveLifecycleStateFromPeerSnapshot({
        currentState: "failed",
        inRoom: true,
        peerSummary: summarizePeerConnectionStates(states),
      })
    ).toBe("failed");
  });
});

describe("resolveLifecycleStateAfterDisconnect", () => {
  it("stays connected when other peers remain connected", () => {
    expect(
      resolveLifecycleStateAfterDisconnect({
        currentState: "connected",
        inRoom: true,
        peerSummary: summarizePeerConnectionStates(["connected"]),
      })
    ).toBe("connected");
  });

  it("enters reconnecting when the last active peer drops while still in room", () => {
    expect(
      resolveLifecycleStateAfterDisconnect({
        currentState: "connected",
        inRoom: true,
        peerSummary: summarizePeerConnectionStates([]),
      })
    ).toBe("reconnecting");
  });

  it("does not escalate waiting_for_peer into reconnecting on empty-room snapshots", () => {
    expect(
      resolveLifecycleStateAfterDisconnect({
        currentState: "waiting_for_peer",
        inRoom: true,
        peerSummary: summarizePeerConnectionStates([]),
      })
    ).toBe("waiting_for_peer");
  });
});

describe("shouldTransitionToReconnecting", () => {
  it("only reconnects from active or recovering lifecycle states", () => {
    expect(shouldTransitionToReconnecting("connected")).toBe(true);
    expect(shouldTransitionToReconnecting("negotiating")).toBe(true);
    expect(shouldTransitionToReconnecting("reconnecting")).toBe(true);
    expect(shouldTransitionToReconnecting("waiting_for_peer")).toBe(false);
    expect(shouldTransitionToReconnecting("joining")).toBe(false);
    expect(shouldTransitionToReconnecting("failed")).toBe(false);
    expect(shouldTransitionToReconnecting("leaving")).toBe(false);
  });
});
