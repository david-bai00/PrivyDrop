import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (...args: any[]) => void;

class FakeSocket {
  public id = "socket-1";
  public emitted: Array<{ event: string; payload: any }> = [];
  private listeners = new Map<string, Set<Listener>>();
  private onceWrappers = new Map<string, Map<Listener, Listener>>();

  on(event: string, listener: Listener) {
    const current = this.listeners.get(event) ?? new Set<Listener>();
    current.add(listener);
    this.listeners.set(event, current);
    return this;
  }

  once(event: string, listener: Listener) {
    const wrapped: Listener = (...args: any[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    const wrappers = this.onceWrappers.get(event) ?? new Map<Listener, Listener>();
    wrappers.set(listener, wrapped);
    this.onceWrappers.set(event, wrappers);
    return this.on(event, wrapped);
  }

  off(event: string, listener?: Listener) {
    if (!listener) {
      this.listeners.delete(event);
       this.onceWrappers.delete(event);
      return this;
    }
    const wrapped = this.onceWrappers.get(event)?.get(listener);
    this.listeners.get(event)?.delete(wrapped ?? listener);
    this.onceWrappers.get(event)?.delete(listener);
    if (this.listeners.get(event)?.size === 0) {
      this.listeners.delete(event);
    }
    return this;
  }

  emit(event: string, payload?: any) {
    this.emitted.push({ event, payload });
    const current = Array.from(this.listeners.get(event) ?? []);
    for (const listener of current) {
      listener(payload);
    }
    return this;
  }

  disconnect() {
    this.emitted.push({ event: "disconnect", payload: undefined });
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0;
  }
}

const fakeSocket = new FakeSocket();

vi.mock("socket.io-client", () => ({
  default: vi.fn(() => fakeSocket),
}));

vi.mock("@/app/config/environment", () => ({
  getLoggingConfig: () => ({
    enableBackendLogs: false,
    enableDebugConsoleLogs: false,
    enableInfoConsoleLogs: false,
    backendSampleRates: {
      debug: 0,
      info: 0,
      warn: 1,
      error: 1,
    },
  }),
}));

vi.mock("@/app/config/api", () => ({
  postLogToBackend: vi.fn(async () => undefined),
}));

import BaseWebRTC from "@/lib/webrtc_base";

class TestWebRTC extends BaseWebRTC {
  protected createDataChannel(): void {}
}

describe("BaseWebRTC.joinRoom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeSocket.id = "socket-1";
    fakeSocket.emitted = [];
    fakeSocket.off("joinResponse");
    fakeSocket.off("ready");
    fakeSocket.off("recipient-ready");
    fakeSocket.off("offer");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats initiator ready signals as equivalent join success", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    const lifecycleEvents: any[] = [];
    peer.onLifecycleEvent = (event) => {
      lifecycleEvents.push(event);
    };

    const joinTask = peer.joinRoom("room-1", true, true);
    expect(fakeSocket.emitted[0]).toEqual({
      event: "join",
      payload: { roomId: "room-1" },
    });

    fakeSocket.emit("ready", { peerId: "peer-a" });
    await joinTask;

    expect(peer.isInRoom).toBe(true);
    expect(peer.roomId).toBe("room-1");
    expect(fakeSocket.emitted.some((item) => item.event === "initiator-online")).toBe(
      true
    );
    expect(lifecycleEvents).toEqual([
      { type: "join_started", roomId: "room-1", isInitiator: true },
      { type: "join_succeeded", roomId: "room-1", isInitiator: true },
    ]);
    expect(fakeSocket.listenerCount("joinResponse")).toBe(0);
    expect(fakeSocket.listenerCount("ready")).toBe(0);
    expect(fakeSocket.listenerCount("recipient-ready")).toBe(0);
  });

  it("treats recipient offer signals as equivalent join success", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });

    const joinTask = peer.joinRoom("room-2", false);
    fakeSocket.emit("offer", { from: "peer-a", offer: {} });
    await joinTask;

    expect(peer.isInRoom).toBe(true);
    expect(peer.roomId).toBe("room-2");
    expect(fakeSocket.listenerCount("offer")).toBe(0);
  });

  it("fails with timeout, clears room state, and removes pending listeners", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    const lifecycleEvents: any[] = [];
    peer.onLifecycleEvent = (event) => {
      lifecycleEvents.push(event);
    };

    const joinTask = peer.joinRoom("room-timeout", true);
    const timeoutError = joinTask.catch((error) => error);
    await vi.advanceTimersByTimeAsync(15000);

    await expect(timeoutError).resolves.toBeInstanceOf(Error);
    await expect(joinTask).rejects.toThrow("Join room timeout");
    expect(peer.isInRoom).toBe(false);
    expect(peer.roomId).toBeNull();
    expect(lifecycleEvents).toEqual([
      { type: "join_started", roomId: "room-timeout", isInitiator: true },
      {
        type: "join_failed",
        roomId: "room-timeout",
        isInitiator: true,
        error: "Join room timeout",
      },
    ]);
    expect(fakeSocket.listenerCount("joinResponse")).toBe(0);
    expect(fakeSocket.listenerCount("ready")).toBe(0);
    expect(fakeSocket.listenerCount("recipient-ready")).toBe(0);
  });
});
