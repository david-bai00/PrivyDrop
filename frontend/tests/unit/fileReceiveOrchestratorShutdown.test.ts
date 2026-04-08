import { describe, expect, it } from "vitest";

import { FileReceiveOrchestrator } from "@/lib/receive/FileReceiveOrchestrator";
import type { SendResult, fileMetadata } from "@/types/webrtc";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakeRecipient() {
  const sendOk = async (): Promise<SendResult> => ({
    ok: true,
    peerId: "peer-1",
    attempts: 1,
    finalState: "open",
  });

  return {
    onDataReceived: null as null | ((data: string | ArrayBuffer, peerId: string) => void | Promise<void>),
    sendData: sendOk,
  };
}

describe("FileReceiveOrchestrator shutdown", () => {
  it("queues and escalates concurrent shutdown calls instead of dropping later requests", async () => {
    const recipient = createFakeRecipient();
    const orchestrator = new FileReceiveOrchestrator(recipient as any);

    const meta: fileMetadata = {
      type: "fileMeta",
      fileId: "file-1",
      name: "a.txt",
      size: 123,
      fullName: "a.txt",
      folderName: "",
      fileType: "text/plain",
    };

    await recipient.onDataReceived?.(JSON.stringify(meta), "peer-1");
    expect(orchestrator.getPendingFilesMeta().has("file-1")).toBe(true);

    const receptionPromise = orchestrator.requestFile("file-1");

    // Make the first shutdown action take time so the second call reliably overlaps.
    const closeGate = createDeferred<void>();
    const stateManager = (orchestrator as any).stateManager as {
      updateActiveFileReception: (updates: Record<string, unknown>) => void;
      getLifecycleState: () => string;
    };
    stateManager.updateActiveFileReception({
      writeStream: {
        close: () => closeGate.promise,
      },
    });

    const shutdownPeerDisconnect = orchestrator.shutdown(
      "peer_disconnect",
      "TEST_PEER_DISCONNECT"
    );
    const shutdownCleanup = orchestrator.shutdown("cleanup", "TEST_CLEANUP");

    closeGate.resolve();

    await expect(receptionPromise).rejects.toThrow();
    await Promise.all([shutdownPeerDisconnect, shutdownCleanup]);

    expect(orchestrator.getPendingFilesMeta().size).toBe(0);
    expect(stateManager.getLifecycleState()).toBe("idle");
  });
});

