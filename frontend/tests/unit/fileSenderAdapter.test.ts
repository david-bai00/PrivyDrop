import { beforeEach, describe, expect, it, vi } from "vitest";

describe("FileSender adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("delegates send operations and only cleans up on shutdown policies that clear transfer state", async () => {
    const orchestrator = {
      sendFileMeta: vi.fn(async () => undefined),
      sendPayloadSnapshot: vi.fn(async () => undefined),
      sendString: vi.fn(async () => undefined),
      setProgressCallback: vi.fn(),
      getTransferStats: vi.fn(() => ({ transfers: 1 })),
      handlePeerReconnection: vi.fn(),
      cleanup: vi.fn(),
    };

    vi.doMock("@/lib/transfer/FileTransferOrchestrator", () => ({
      FileTransferOrchestrator: vi.fn(function MockFileTransferOrchestrator() {
        return orchestrator;
      }),
    }));

    const { default: FileSender } = await import("@/lib/fileSender");
    const adapter = new FileSender({} as any);

    const callback = vi.fn();
    await adapter.sendFileMeta([{ name: "demo.txt" } as any], "peer-1");
    await adapter.sendPayloadSnapshot("hello", [], "peer-1");
    await adapter.sendString("hello", "peer-1");
    adapter.setProgressCallback(callback, "peer-1");
    expect(adapter.getTransferStats("peer-1")).toEqual({ transfers: 1 });
    adapter.handlePeerReconnection("peer-1");
    adapter.shutdown("leave_room");
    adapter.shutdown("reset_app");
    adapter.cleanup();

    expect(orchestrator.sendFileMeta).toHaveBeenCalledWith(
      [{ name: "demo.txt" }],
      "peer-1"
    );
    expect(orchestrator.sendPayloadSnapshot).toHaveBeenCalledWith(
      "hello",
      [],
      "peer-1"
    );
    expect(orchestrator.sendString).toHaveBeenCalledWith("hello", "peer-1");
    expect(orchestrator.setProgressCallback).toHaveBeenCalledWith(
      callback,
      "peer-1"
    );
    expect(orchestrator.handlePeerReconnection).toHaveBeenCalledWith("peer-1");
    expect(orchestrator.cleanup).toHaveBeenCalledTimes(3);
  });
});
