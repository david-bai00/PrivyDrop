import { afterEach, describe, expect, it, vi } from "vitest";

import { FileTransferOrchestrator } from "@/lib/transfer/FileTransferOrchestrator";

function createOrchestrator() {
  const webrtcConnection = {
    peerConnections: new Map(),
    dataChannels: new Map(),
    sendData: vi.fn(),
    fireError: vi.fn(),
    onDataReceived: undefined as unknown,
  };

  const orchestrator = new FileTransferOrchestrator(webrtcConnection as any);
  return {
    orchestrator,
    orchestratorAny: orchestrator as any,
  };
}

function createPendingFile() {
  return {
    name: "resume-target.txt",
    size: 1024,
    type: "text/plain",
    fullName: "resume-target.txt",
    folderName: "",
    lastModified: 0,
  } as any;
}

describe("FileTransferOrchestrator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defers resumed requests for the same file until active peers finish", async () => {
    const { orchestratorAny } = createOrchestrator();
    const fileId = "file-1";
    orchestratorAny.stateManager.addPendingFile(fileId, createPendingFile());

    const callOrder: string[] = [];
    let resolvePeerA!: () => void;

    orchestratorAny.sendSingleFile = vi.fn(
      async (_file: unknown, peerId: string, offset: number) => {
        callOrder.push(`${peerId}:${offset}`);

        if (peerId === "peer-a") {
          await new Promise<void>((resolve) => {
            resolvePeerA = resolve;
          });
        }
      }
    );

    const peerATask = orchestratorAny.handleFileRequest(
      { fileId, offset: 0 },
      "peer-a"
    );
    await Promise.resolve();

    const peerBTask = orchestratorAny.handleFileRequest(
      { fileId, offset: 65536 },
      "peer-b"
    );
    await Promise.resolve();

    expect(orchestratorAny.sendSingleFile).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["peer-a:0"]);

    resolvePeerA();

    await peerATask;
    await peerBTask;

    expect(orchestratorAny.sendSingleFile).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(["peer-a:0", "peer-b:65536"]);
  });

  it("keeps initial concurrent requests for the same file running immediately", async () => {
    const { orchestratorAny } = createOrchestrator();
    const fileId = "file-2";
    orchestratorAny.stateManager.addPendingFile(fileId, createPendingFile());

    const callOrder: string[] = [];
    let resolvePeerA!: () => void;
    let resolvePeerB!: () => void;

    orchestratorAny.sendSingleFile = vi.fn(
      async (_file: unknown, peerId: string, offset: number) => {
        callOrder.push(`${peerId}:${offset}`);

        await new Promise<void>((resolve) => {
          if (peerId === "peer-a") {
            resolvePeerA = resolve;
          } else {
            resolvePeerB = resolve;
          }
        });
      }
    );

    const peerATask = orchestratorAny.handleFileRequest(
      { fileId, offset: 0 },
      "peer-a"
    );
    await Promise.resolve();

    const peerBTask = orchestratorAny.handleFileRequest(
      { fileId, offset: 0 },
      "peer-b"
    );
    await Promise.resolve();

    expect(orchestratorAny.sendSingleFile).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(["peer-a:0", "peer-b:0"]);

    resolvePeerA();
    resolvePeerB();

    await peerATask;
    await peerBTask;
  });
});
