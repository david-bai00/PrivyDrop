import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (...args: any[]) => void;

class FakeSocket {
  public id = "socket-1";
  public connected = true;
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
    if (event === "connect") {
      this.connected = true;
    } else if (event === "disconnect") {
      this.connected = false;
    }
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

  public async triggerReconnection(): Promise<void> {
    await this.attemptReconnection();
  }

  public setInRoomState(roomId: string, isInitiator: boolean): void {
    this.roomId = roomId;
    this.isInRoom = true;
    this.isInitiator = isInitiator;
  }

  public setPeerDisconnectedState(value: boolean): void {
    this.isPeerDisconnected = value;
  }

  public setReconnectionInProgressState(value: boolean): void {
    this.reconnectionInProgress = value;
  }

  public attachDataChannelForTest(
    peerId: string,
    dataChannel: RTCDataChannel,
    peerConnection?: RTCPeerConnection
  ): void {
    this.dataChannels.set(peerId, dataChannel);
    if (peerConnection) {
      this.peerConnections.set(peerId, peerConnection);
    }
    this.setupDataChannel(dataChannel, peerId);
  }
}

function createFakeDataChannel(readyState: RTCDataChannelState = "open") {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as RTCDataChannel & {
    close: ReturnType<typeof vi.fn>;
  };
}

function createFakePeerConnection() {
  return {
    close: vi.fn(),
  } as unknown as RTCPeerConnection & {
    close: ReturnType<typeof vi.fn>;
  };
}

describe("BaseWebRTC.joinRoom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeSocket.id = "socket-1";
    fakeSocket.connected = true;
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

  it("forces a rejoin during reconnect even when the room flag is still true", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    const lifecycleEvents: any[] = [];
    peer.onLifecycleEvent = (event) => {
      lifecycleEvents.push(event);
    };
    peer.setInRoomState("room-reconnect", true);
    peer.setPeerDisconnectedState(true);

    const reconnectTask = peer.triggerReconnection();

    expect(fakeSocket.emitted.some((item) => item.event === "join")).toBe(true);

    fakeSocket.emit("joinResponse", {
      success: true,
      message: "ok",
      roomId: "room-reconnect",
    });
    await reconnectTask;

    expect(lifecycleEvents).toEqual([
      { type: "reconnect_started", roomId: "room-reconnect", isInitiator: true },
      { type: "reconnect_succeeded", roomId: "room-reconnect", isInitiator: true },
    ]);
    expect(
      fakeSocket.emitted.some((item) => item.event === "initiator-online")
    ).toBe(true);
  });

  it("defers reconnect join attempts until the socket reconnects", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    const lifecycleEvents: any[] = [];
    peer.onLifecycleEvent = (event) => {
      lifecycleEvents.push(event);
    };

    peer.setInRoomState("room-offline", false);

    fakeSocket.connected = false;
    fakeSocket.emit("disconnect");
    await Promise.resolve();

    expect(
      fakeSocket.emitted.some(
        (item) => item.event === "join" && item.payload?.roomId === "room-offline"
      )
    ).toBe(false);

    fakeSocket.id = "socket-2";
    fakeSocket.emit("connect");
    await Promise.resolve();

    expect(
      fakeSocket.emitted.some(
        (item) => item.event === "join" && item.payload?.roomId === "room-offline"
      )
    ).toBe(true);

    fakeSocket.emit("joinResponse", {
      success: true,
      message: "ok",
      roomId: "room-offline",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(lifecycleEvents).toEqual([
      { type: "reconnect_started", roomId: "room-offline", isInitiator: false },
      {
        type: "reconnect_succeeded",
        roomId: "room-offline",
        isInitiator: false,
      },
    ]);
    expect(peer.isInRoom).toBe(true);
    expect(peer.roomId).toBe("room-offline");
  });

  it("does not escalate recoverable send failures while reconnecting", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    const onError = vi.fn();
    peer.onError = onError;
    peer.setReconnectionInProgressState(true);
    peer.dataChannels.set("peer-a", createFakeDataChannel("closing"));

    const sendTask = peer.sendToPeer("hello", "peer-a");
    await vi.advanceTimersByTimeAsync(5100);
    const result = await sendTask;

    expect(result.ok).toBe(false);
    expect(result.finalState).toBe("closing");
    expect(onError).not.toHaveBeenCalled();
  });

  it("treats data channel close as a disconnect signal and cleans up the peer", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    const connectionStates: Array<{ state: RTCPeerConnectionState; peerId: string }> =
      [];
    peer.onConnectionStateChange = (state, peerId) => {
      connectionStates.push({ state, peerId });
    };

    const dataChannel = createFakeDataChannel("open");
    const peerConnection = createFakePeerConnection();
    peer.attachDataChannelForTest("peer-a", dataChannel, peerConnection);

    dataChannel.onclose?.(new Event("close"));
    await Promise.resolve();

    expect(connectionStates).toContainEqual({ state: "closed", peerId: "peer-a" });
    expect(dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
    expect(peer.peerConnections.has("peer-a")).toBe(false);
    expect(peer.dataChannels.has("peer-a")).toBe(false);
  });

  it("does not force a room rejoin for initiator-side peer interrupts", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    peer.setInRoomState("room-multi", true);

    const dataChannel = createFakeDataChannel("open");
    const peerConnection = createFakePeerConnection();
    peer.attachDataChannelForTest("peer-a", dataChannel, peerConnection);

    dataChannel.onclose?.(new Event("close"));
    await Promise.resolve();

    expect(
      fakeSocket.emitted.some(
        (item) => item.event === "join" && item.payload?.roomId === "room-multi"
      )
    ).toBe(false);
  });

  it("ignores delayed data-channel open callbacks for gracefully disconnected peers", async () => {
    const peer = new TestWebRTC({
      iceServers: [],
      socketOptions: {},
      signalingServer: "",
    });
    const onDataChannelOpen = vi.fn();
    peer.onDataChannelOpen = onDataChannelOpen;

    const dataChannel = createFakeDataChannel("open");
    peer.attachDataChannelForTest("peer-a", dataChannel);

    dataChannel.onopen?.(new Event("open"));
    peer.markPeerGracefullyDisconnected("peer-a");

    await vi.advanceTimersByTimeAsync(60);

    expect(onDataChannelOpen).not.toHaveBeenCalled();
  });

});
