import { beforeEach, describe, expect, it, vi } from "vitest";

function createOrchestrator() {
  return {
    onFileMetaReceived: undefined as ((meta: any) => void) | undefined,
    onStringReceived: undefined as ((value: string) => void) | undefined,
    onPayloadSnapshotReceived: undefined as ((snapshot: any) => void) | undefined,
    onFileReceived: undefined as ((file: any) => Promise<void>) | undefined,
    setProgressCallback: vi.fn(),
    setSaveDirectory: vi.fn(async () => undefined),
    requestFile: vi.fn(async () => undefined),
    requestFolder: vi.fn(async () => undefined),
    handlePeerDisconnect: vi.fn(async () => undefined),
    leaveRoom: vi.fn(async () => undefined),
    forceReset: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
    getTransferStats: vi.fn(() => ({
      stateManager: {
        hasActiveFileReception: true,
        currentPeerId: "peer-1",
      },
    })),
    getSaveType: vi.fn(() => ({ "file-1": true })),
    getPendingFilesMeta: vi.fn(() => new Map([["file-1", { fileId: "file-1" }]])),
    getFolderProgresses: vi.fn(() => ({ folder: { progress: 0.5 } })),
    setCurrentPeerId: vi.fn(),
  };
}

describe("FileReceiver adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("forwards callbacks and clears compatibility saveType across disconnect-style shutdowns", async () => {
    const orchestrator = createOrchestrator();

    vi.doMock("@/lib/receive", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/receive")>();
      return {
        ...actual,
        createFileReceiveService: vi.fn(() => orchestrator),
        FileReceiveOrchestrator: vi.fn(),
      };
    });

    const { default: FileReceiver } = await import("@/lib/fileReceiver");
    const adapter = new FileReceiver({} as any);

    const onMeta = vi.fn();
    const onString = vi.fn();
    const onSnapshot = vi.fn();
    const onFile = vi.fn(async () => undefined);
    const progressCallback = vi.fn();

    adapter.onFileMetaReceived = onMeta;
    adapter.onStringReceived = onString;
    adapter.onPayloadSnapshotReceived = onSnapshot;
    adapter.onFileReceived = onFile;

    adapter.setProgressCallback(progressCallback);
    await adapter.setSaveDirectory({} as any);
    await adapter.requestFile("file-1");
    await adapter.requestFolder("folder");
    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    expect(adapter.saveType).toEqual({ "file-1": true });
    orchestrator.onStringReceived?.("hello");
    orchestrator.onPayloadSnapshotReceived?.({ type: "payloadSnapshot" });
    await orchestrator.onFileReceived?.({ name: "demo.txt" });
    await adapter.handlePeerDisconnect("CONNECTION_LOST");
    expect(adapter.saveType).toEqual({});
    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    await adapter.gracefulShutdown("CONNECTION_LOST");
    expect(adapter.saveType).toEqual({});
    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    await adapter.shutdown("peer_disconnect", "SENDER_PEER_DISCONNECTED");

    expect(onMeta).toHaveBeenCalledWith({ fileId: "file-1" });
    expect(onString).toHaveBeenCalledWith("hello");
    expect(onSnapshot).toHaveBeenCalledWith({ type: "payloadSnapshot" });
    expect(onFile).toHaveBeenCalledWith({ name: "demo.txt" });
    expect(adapter.saveType).toEqual({});
    expect(adapter.getPendingFilesMeta()).toEqual(
      new Map([["file-1", { fileId: "file-1" }]])
    );
    expect(adapter.getFolderProgresses()).toEqual({
      folder: { progress: 0.5 },
    });
    expect(adapter.hasActiveFileReception()).toBe(true);
    expect(adapter.getCurrentPeerId()).toBe("peer-1");
    adapter.setCurrentPeerId("peer-2");
    expect(orchestrator.setCurrentPeerId).toHaveBeenCalledWith("peer-2");
    expect(orchestrator.setProgressCallback).toHaveBeenCalledWith(
      progressCallback
    );
    expect(orchestrator.setSaveDirectory).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestFile).toHaveBeenCalledWith("file-1", true);
    expect(orchestrator.requestFolder).toHaveBeenCalledWith("folder");
    expect(orchestrator.handlePeerDisconnect).toHaveBeenCalledTimes(2);
    expect(orchestrator.shutdown).toHaveBeenCalledWith(
      "peer_disconnect",
      "SENDER_PEER_DISCONNECTED"
    );
  });

  it("clears compatibility saveType for room-leave and reset-like shutdowns", async () => {
    const orchestrator = createOrchestrator();

    vi.doMock("@/lib/receive", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/receive")>();
      return {
        ...actual,
        createFileReceiveService: vi.fn(() => orchestrator),
        FileReceiveOrchestrator: vi.fn(),
      };
    });

    const { default: FileReceiver } = await import("@/lib/fileReceiver");
    const adapter = new FileReceiver({} as any);

    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    expect(adapter.saveType).toEqual({ "file-1": true });

    await adapter.leaveRoom();
    expect(adapter.saveType).toEqual({});

    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    await adapter.forceReset();
    expect(adapter.saveType).toEqual({});

    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    await adapter.cleanup();
    expect(adapter.saveType).toEqual({});

    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    await adapter.shutdown("leave_room", "SERVICE_LEAVE_ROOM");
    expect(adapter.saveType).toEqual({});

    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    await adapter.shutdown("force_reset", "JOIN_NEW_ROOM");
    expect(adapter.saveType).toEqual({});

    orchestrator.onFileMetaReceived?.({ fileId: "file-1" });
    await adapter.shutdown("cleanup", "SERVICE_CLEANUP");
    expect(adapter.saveType).toEqual({});
  });
});
