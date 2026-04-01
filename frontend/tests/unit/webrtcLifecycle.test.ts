import { describe, expect, it } from "vitest";

import {
  normalizeRtcConnectionState,
  resolveLifecycleStateFromPeerEvent,
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

describe("shouldTransitionToReconnecting", () => {
  it("avoids reconnect transitions while leaving", () => {
    expect(shouldTransitionToReconnecting("leaving")).toBe(false);
    expect(shouldTransitionToReconnecting("connected")).toBe(true);
  });
});
