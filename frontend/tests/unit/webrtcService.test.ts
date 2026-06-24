import { beforeEach, describe, expect, it, vi } from "vitest";

class MockPeer {
  public roomId: string | null = "room-1";
  public peerId: string | null = "peer-1";
  public isInRoom = true;
  public peerConnections = new Map<string, object>([["peer-1", {}]]);
  public onLifecycleEvent: ((event: any) => void) | null = null;
  public onConnectionStateChange: ((state: any, peerId: string) => void) | null =
    null;
  public onPeerDisconnected: ((peerId: string) => void) | null = null;
  public onError: ((error: Error) => void) | null = null;
  public onConnectionEstablished: ((peerId: string) => void) | null = null;
  public onDataChannelOpen: ((peerId: string) => void) | null = null;
  public joinRoom = vi.fn(async () => undefined);
  public leaveRoomAndCleanup = vi.fn(async () => {
    this.isInRoom = false;
    this.roomId = null;
    this.peerConnections.clear();
  });
  public cleanUpBeforeExit = vi.fn(async () => {
    this.isInRoom = false;
    this.peerConnections.clear();
  });
}

class MockFileSender {
  public setProgressCallback = vi.fn();
  public handlePeerReconnection = vi.fn();
  public sendPayloadSnapshot = vi.fn(async () => undefined);
  public sendString = vi.fn(async () => undefined);
  public sendFileMeta = vi.fn(async () => undefined);
  public shutdown = vi.fn();
}

class MockFileReceiver {
  public onStringReceived?: (data: string) => void;
  public onPayloadSnapshotReceived?: (snapshot: any) => void;
  public onFileMetaReceived?: (meta: any) => void;
  public onFileReceived?: (file: any) => Promise<void>;
  public setProgressCallback = vi.fn();
  public setCurrentPeerId = vi.fn();
  public getCurrentPeerId = vi.fn(() => "peer-1");
  public shutdown = vi.fn(async () => undefined);
  public handlePeerDisconnect = vi.fn(async () => undefined);
  public hasActiveFileReception = vi.fn(() => false);
}

describe("webrtcService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("shuts down the receiver in the documented order and emits reset events", async () => {
    const receiver = new MockPeer();
    const sender = new MockPeer();
    const fileReceiver = new MockFileReceiver();
    const fileSender = new MockFileSender();

    vi.doMock("@/lib/webrtc_Initiator", () => ({
      default: vi.fn(function MockInitiator() {
        return sender;
      }),
    }));
    vi.doMock("@/lib/webrtc_Recipient", () => ({
      default: vi.fn(function MockRecipient() {
        return receiver;
      }),
    }));
    vi.doMock("@/lib/fileSender", () => ({
      default: vi.fn(function MockFileSender() {
        return fileSender;
      }),
    }));
    vi.doMock("@/lib/fileReceiver", () => ({
      default: vi.fn(function MockFileReceiver() {
        return fileReceiver;
      }),
    }));
    vi.doMock("@/app/config/environment", () => ({
      config: { API_URL: "" },
      getIceServers: () => [],
      getSocketOptions: () => ({}),
      getLoggingConfig: () => ({
        enableBackendLogs: false,
        enableDebugConsoleLogs: false,
        enableInfoConsoleLogs: false,
        backendSampleRates: { debug: 0, info: 0, warn: 1, error: 1 },
      }),
    }));
    vi.doMock("@/app/config/api", () => ({
      postLogToBackend: vi.fn(async () => undefined),
    }));

    const { webrtcService } = await import("@/lib/webrtcService");
    const events: any[] = [];
    webrtcService.setObserver({
      onEvent(event) {
        events.push(event);
      },
    });

    await webrtcService.shutdownReceiver("leave_room");

    expect(fileReceiver.shutdown).toHaveBeenCalledWith(
      "leave_room",
      "SERVICE_LEAVE_ROOM"
    );
    expect(receiver.leaveRoomAndCleanup).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: "room_status_changed",
      role: "receiver",
      inRoom: false,
    });
    expect(events).toContainEqual({
      type: "peer_count_changed",
      role: "receiver",
      count: 0,
    });
    expect(events).toContainEqual({
      type: "sender_disconnected_changed",
      disconnected: false,
    });
    expect(events).toContainEqual({
      type: "transfer_progress_cleared",
      direction: "receive",
    });
  });

  it("forces receiver cleanup on disconnect when there is an active reception", async () => {
    const receiver = new MockPeer();
    const sender = new MockPeer();
    const fileReceiver = new MockFileReceiver();
    const fileSender = new MockFileSender();
    fileReceiver.hasActiveFileReception.mockReturnValue(true);

    vi.doMock("@/lib/webrtc_Initiator", () => ({
      default: vi.fn(function MockInitiator() {
        return sender;
      }),
    }));
    vi.doMock("@/lib/webrtc_Recipient", () => ({
      default: vi.fn(function MockRecipient() {
        return receiver;
      }),
    }));
    vi.doMock("@/lib/fileSender", () => ({
      default: vi.fn(function MockFileSender() {
        return fileSender;
      }),
    }));
    vi.doMock("@/lib/fileReceiver", () => ({
      default: vi.fn(function MockFileReceiver() {
        return fileReceiver;
      }),
    }));
    vi.doMock("@/app/config/environment", () => ({
      config: { API_URL: "" },
      getIceServers: () => [],
      getSocketOptions: () => ({}),
      getLoggingConfig: () => ({
        enableBackendLogs: false,
        enableDebugConsoleLogs: false,
        enableInfoConsoleLogs: false,
        backendSampleRates: { debug: 0, info: 0, warn: 1, error: 1 },
      }),
    }));
    vi.doMock("@/app/config/api", () => ({
      postLogToBackend: vi.fn(async () => undefined),
    }));

    const { webrtcService } = await import("@/lib/webrtcService");
    const events: any[] = [];
    webrtcService.setObserver({
      onEvent(event) {
        events.push(event);
      },
    });

    receiver.peerConnections.clear();
    receiver.onPeerDisconnected?.("peer-1");
    await Promise.resolve();

    expect(fileReceiver.handlePeerDisconnect).toHaveBeenCalledWith(
      "SENDER_PEER_DISCONNECTED"
    );
    expect(events).toContainEqual({
      type: "transfer_progress_cleared",
      direction: "receive",
      peerId: "peer-1",
    });
    expect(events).toContainEqual({
      type: "sender_disconnected_changed",
      disconnected: true,
    });
  });

  it("does not mark sender disconnected after the receiver has already left the room", async () => {
    const receiver = new MockPeer();
    const sender = new MockPeer();
    const fileReceiver = new MockFileReceiver();
    const fileSender = new MockFileSender();

    vi.doMock("@/lib/webrtc_Initiator", () => ({
      default: vi.fn(function MockInitiator() {
        return sender;
      }),
    }));
    vi.doMock("@/lib/webrtc_Recipient", () => ({
      default: vi.fn(function MockRecipient() {
        return receiver;
      }),
    }));
    vi.doMock("@/lib/fileSender", () => ({
      default: vi.fn(function MockFileSender() {
        return fileSender;
      }),
    }));
    vi.doMock("@/lib/fileReceiver", () => ({
      default: vi.fn(function MockFileReceiver() {
        return fileReceiver;
      }),
    }));
    vi.doMock("@/app/config/environment", () => ({
      config: { API_URL: "" },
      getIceServers: () => [],
      getSocketOptions: () => ({}),
      getLoggingConfig: () => ({
        enableBackendLogs: false,
        enableDebugConsoleLogs: false,
        enableInfoConsoleLogs: false,
        backendSampleRates: { debug: 0, info: 0, warn: 1, error: 1 },
      }),
    }));
    vi.doMock("@/app/config/api", () => ({
      postLogToBackend: vi.fn(async () => undefined),
    }));

    const { webrtcService } = await import("@/lib/webrtcService");
    const events: any[] = [];
    webrtcService.setObserver({
      onEvent(event) {
        events.push(event);
      },
    });

    receiver.isInRoom = false;
    receiver.peerConnections.clear();

    receiver.onPeerDisconnected?.("peer-1");
    await Promise.resolve();

    expect(events).not.toContainEqual({
      type: "sender_disconnected_changed",
      disconnected: true,
    });
  });

  it("delegates sender broadcasts to SenderPayloadBroadcaster", async () => {
    const receiver = new MockPeer();
    const sender = new MockPeer();
    const fileReceiver = new MockFileReceiver();
    const fileSender = new MockFileSender();

    vi.doMock("@/lib/webrtc_Initiator", () => ({
      default: vi.fn(function MockInitiator() {
        return sender;
      }),
    }));
    vi.doMock("@/lib/webrtc_Recipient", () => ({
      default: vi.fn(function MockRecipient() {
        return receiver;
      }),
    }));
    vi.doMock("@/lib/fileSender", () => ({
      default: vi.fn(function MockFileSender() {
        return fileSender;
      }),
    }));
    vi.doMock("@/lib/fileReceiver", () => ({
      default: vi.fn(function MockFileReceiver() {
        return fileReceiver;
      }),
    }));
    vi.doMock("@/app/config/environment", () => ({
      config: { API_URL: "" },
      getIceServers: () => [],
      getSocketOptions: () => ({}),
      getLoggingConfig: () => ({
        enableBackendLogs: false,
        enableDebugConsoleLogs: false,
        enableInfoConsoleLogs: false,
        backendSampleRates: { debug: 0, info: 0, warn: 1, error: 1 },
      }),
    }));
    vi.doMock("@/app/config/api", () => ({
      postLogToBackend: vi.fn(async () => undefined),
    }));

    const { webrtcService } = await import("@/lib/webrtcService");
    sender.peerConnections.set("peer-2", {});

    await expect(
      webrtcService.broadcastDataToAllPeers("hello", [])
    ).resolves.toBe(true);
    await expect(
      webrtcService.broadcastDataToPeer("peer-1", "hello", [
        { name: "demo.txt", size: 10, type: "text/plain", lastModified: 1 },
      ] as any)
    ).resolves.toBe(true);

    expect(fileSender.sendPayloadSnapshot).toHaveBeenCalledWith(
      "hello",
      [],
      "peer-1"
    );
    expect(fileSender.sendPayloadSnapshot).toHaveBeenCalledWith(
      "hello",
      [],
      "peer-2"
    );
    expect(fileSender.sendString).toHaveBeenCalledWith("hello", "peer-1");
    expect(fileSender.sendString).toHaveBeenCalledWith("hello", "peer-2");
    expect(fileSender.sendFileMeta).toHaveBeenCalledWith(
      [{ name: "demo.txt", size: 10, type: "text/plain", lastModified: 1 }],
      "peer-1"
    );
  });

  it("keeps an active receiver transfer running when another receiver disconnects", async () => {
    const receiver = new MockPeer();
    const sender = new MockPeer();
    const fileReceiver = new MockFileReceiver();
    const fileSender = new MockFileSender();
    fileReceiver.hasActiveFileReception.mockReturnValue(true);
    fileReceiver.getCurrentPeerId.mockReturnValue("sender-peer");

    vi.doMock("@/lib/webrtc_Initiator", () => ({
      default: vi.fn(function MockInitiator() {
        return sender;
      }),
    }));
    vi.doMock("@/lib/webrtc_Recipient", () => ({
      default: vi.fn(function MockRecipient() {
        return receiver;
      }),
    }));
    vi.doMock("@/lib/fileSender", () => ({
      default: vi.fn(function MockFileSender() {
        return fileSender;
      }),
    }));
    vi.doMock("@/lib/fileReceiver", () => ({
      default: vi.fn(function MockFileReceiver() {
        return fileReceiver;
      }),
    }));
    vi.doMock("@/app/config/environment", () => ({
      config: { API_URL: "" },
      getIceServers: () => [],
      getSocketOptions: () => ({}),
      getLoggingConfig: () => ({
        enableBackendLogs: false,
        enableDebugConsoleLogs: false,
        enableInfoConsoleLogs: false,
        backendSampleRates: { debug: 0, info: 0, warn: 1, error: 1 },
      }),
    }));
    vi.doMock("@/app/config/api", () => ({
      postLogToBackend: vi.fn(async () => undefined),
    }));

    const { webrtcService } = await import("@/lib/webrtcService");
    const events: any[] = [];
    webrtcService.setObserver({
      onEvent(event) {
        events.push(event);
      },
    });

    receiver.onConnectionStateChange?.("connected", "sender-peer");
    receiver.onPeerDisconnected?.("other-receiver-peer");
    await Promise.resolve();

    expect(fileReceiver.handlePeerDisconnect).not.toHaveBeenCalled();
    expect(events).not.toContainEqual({
      type: "sender_disconnected_changed",
      disconnected: true,
    });
  });

  it("restores the receiver current peer id when the connection comes back", async () => {
    const receiver = new MockPeer();
    const sender = new MockPeer();
    const fileReceiver = new MockFileReceiver();
    const fileSender = new MockFileSender();

    vi.doMock("@/lib/webrtc_Initiator", () => ({
      default: vi.fn(function MockInitiator() {
        return sender;
      }),
    }));
    vi.doMock("@/lib/webrtc_Recipient", () => ({
      default: vi.fn(function MockRecipient() {
        return receiver;
      }),
    }));
    vi.doMock("@/lib/fileSender", () => ({
      default: vi.fn(function MockFileSender() {
        return fileSender;
      }),
    }));
    vi.doMock("@/lib/fileReceiver", () => ({
      default: vi.fn(function MockFileReceiver() {
        return fileReceiver;
      }),
    }));
    vi.doMock("@/app/config/environment", () => ({
      config: { API_URL: "" },
      getIceServers: () => [],
      getSocketOptions: () => ({}),
      getLoggingConfig: () => ({
        enableBackendLogs: false,
        enableDebugConsoleLogs: false,
        enableInfoConsoleLogs: false,
        backendSampleRates: { debug: 0, info: 0, warn: 1, error: 1 },
      }),
    }));
    vi.doMock("@/app/config/api", () => ({
      postLogToBackend: vi.fn(async () => undefined),
    }));

    await import("@/lib/webrtcService");

    receiver.onConnectionEstablished?.("peer-reconnected");

    expect(fileReceiver.setCurrentPeerId).toHaveBeenCalledWith("peer-reconnected");
  });

  it("resets sender transfer state when the sender peer reconnects", async () => {
    const receiver = new MockPeer();
    const sender = new MockPeer();
    const fileReceiver = new MockFileReceiver();
    const fileSender = new MockFileSender();

    vi.doMock("@/lib/webrtc_Initiator", () => ({
      default: vi.fn(function MockInitiator() {
        return sender;
      }),
    }));
    vi.doMock("@/lib/webrtc_Recipient", () => ({
      default: vi.fn(function MockRecipient() {
        return receiver;
      }),
    }));
    vi.doMock("@/lib/fileSender", () => ({
      default: vi.fn(function MockFileSender() {
        return fileSender;
      }),
    }));
    vi.doMock("@/lib/fileReceiver", () => ({
      default: vi.fn(function MockFileReceiver() {
        return fileReceiver;
      }),
    }));
    vi.doMock("@/app/config/environment", () => ({
      config: { API_URL: "" },
      getIceServers: () => [],
      getSocketOptions: () => ({}),
      getLoggingConfig: () => ({
        enableBackendLogs: false,
        enableDebugConsoleLogs: false,
        enableInfoConsoleLogs: false,
        backendSampleRates: { debug: 0, info: 0, warn: 1, error: 1 },
      }),
    }));
    vi.doMock("@/app/config/api", () => ({
      postLogToBackend: vi.fn(async () => undefined),
    }));

    await import("@/lib/webrtcService");

    sender.onConnectionEstablished?.("peer-reconnected");

    expect(fileSender.handlePeerReconnection).toHaveBeenCalledWith(
      "peer-reconnected"
    );
  });
});
