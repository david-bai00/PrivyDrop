import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageProcessor } from "@/lib/receive/MessageProcessor";
import { ReceptionStateManager } from "@/lib/receive/ReceptionStateManager";

function createSendResult(ok = true) {
  return {
    ok,
    peerId: "peer-1",
    attempts: 1,
    finalState: ok ? "open" : "closing",
    reason: ok ? undefined : "send_failed",
  };
}

describe("MessageProcessor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("routes metadata, payload snapshots, string chunks, and binary payloads", async () => {
    const stateManager = new ReceptionStateManager();
    const onFileMetaReceived = vi.fn();
    const onPayloadSnapshotReceived = vi.fn();
    const onStringReceived = vi.fn();
    const delegate = {
      onFileMetaReceived,
      onPayloadSnapshotReceived,
      onStringReceived,
      log: vi.fn(),
    };
    const processor = new MessageProcessor(
      stateManager,
      { sendData: vi.fn() } as any,
      delegate
    );

    await expect(
      processor.handleReceivedMessage(
        JSON.stringify({
          type: "fileMeta",
          fileId: "file-1",
          name: "a.txt",
          size: 3,
          fullName: "a.txt",
          folderName: "",
          fileType: "text/plain",
        }),
        "peer-1"
      )
    ).resolves.toBeNull();
    expect(onFileMetaReceived).toHaveBeenCalledTimes(1);

    await processor.handleReceivedMessage(
      JSON.stringify({
        type: "payloadSnapshot",
        hasContent: true,
        fileIds: ["file-1"],
      }),
      "peer-1"
    );
    expect(onPayloadSnapshotReceived).toHaveBeenCalledWith({
      type: "payloadSnapshot",
      hasContent: true,
      fileIds: ["file-1"],
    });

    await processor.handleReceivedMessage(
      JSON.stringify({
        type: "stringMetadata",
        length: 2,
      }),
      "peer-1"
    );
    await processor.handleReceivedMessage(
      JSON.stringify({
        type: "string",
        index: 0,
        chunk: "he",
        total: 2,
      }),
      "peer-1"
    );
    await processor.handleReceivedMessage(
      JSON.stringify({
        type: "string",
        index: 1,
        chunk: "llo",
        total: 2,
      }),
      "peer-1"
    );
    expect(onStringReceived).toHaveBeenCalledWith("hello");

    const binary = new Uint8Array([1, 2, 3]).buffer;
    await expect(
      processor.handleReceivedMessage(binary, "peer-1")
    ).resolves.toBe(binary);
  });

  it("logs parse errors, missing handlers, and missing callbacks", async () => {
    const stateManager = new ReceptionStateManager();
    const delegate = {
      log: vi.fn(),
    };
    const processor = new MessageProcessor(
      stateManager,
      { sendData: vi.fn() } as any,
      delegate as any
    );

    await processor.handleReceivedMessage("{bad-json", "peer-1");
    expect(delegate.log).toHaveBeenCalledWith(
      "error",
      "received_json_parse_failed",
      expect.objectContaining({ peerId: "peer-1" })
    );

    await processor.handleReceivedMessage(
      JSON.stringify({ type: "unknown" }),
      "peer-1"
    );
    expect(delegate.log).toHaveBeenCalledWith("warn", "message_handler_missing", {
      peerId: "peer-1",
    });

    await processor.handleReceivedMessage(
      JSON.stringify({
        type: "fileMeta",
        fileId: "file-2",
        name: "b.txt",
        size: 1,
        fullName: "b.txt",
        folderName: "",
        fileType: "text/plain",
      }),
      "peer-1"
    );
    expect(delegate.log).toHaveBeenCalledWith(
      "error",
      "file_meta_callback_missing",
      { fileId: "file-2" }
    );

    await processor.handleReceivedMessage(
      JSON.stringify({
        type: "string",
        index: 0,
        chunk: "x",
        total: 1,
      }),
      "peer-1"
    );
    expect(delegate.log).toHaveBeenCalledWith(
      "warn",
      "string_chunk_without_active_reception"
    );
  });

  it("sends control messages and returns explicit missing-peer failures", async () => {
    const stateManager = new ReceptionStateManager();
    const sendData = vi.fn(async (_data: string, _peerId: string) =>
      createSendResult(true)
    );
    const delegate = {
      log: vi.fn(),
    };
    const processor = new MessageProcessor(
      stateManager,
      { sendData } as any,
      delegate as any
    );

    await expect(processor.sendFileRequest("file-1")).resolves.toEqual({
      ok: false,
      peerId: "",
      attempts: 0,
      finalState: "missing",
      reason: "missing_current_peer",
    });

    stateManager.setCurrentPeerId("peer-1");

    await expect(processor.sendFileRequest("file-1", 10)).resolves.toMatchObject({
      ok: true,
      peerId: "peer-1",
    });
    await expect(
      processor.sendFileReceiveComplete("file-1", 123, 2, true)
    ).resolves.toMatchObject({ ok: true });
    await expect(
      processor.sendFolderReceiveComplete("folder-a", ["file-1"], true)
    ).resolves.toMatchObject({ ok: true });

    expect(sendData).toHaveBeenCalledTimes(3);
    expect(delegate.log).toHaveBeenCalledWith("info", "file_request_sent", {
      request: { type: "fileRequest", fileId: "file-1", offset: 10 },
      peerId: "peer-1",
    });
  });
});
