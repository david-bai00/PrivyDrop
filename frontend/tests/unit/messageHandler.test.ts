import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageHandler } from "@/lib/transfer/MessageHandler";
import { StateManager } from "@/lib/transfer/StateManager";

describe("MessageHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs and delegates file requests after the firefox compatibility delay", async () => {
    const stateManager = new StateManager();
    const delegate = {
      handleFileRequest: vi.fn(async () => undefined),
      log: vi.fn(),
    };
    const handler = new MessageHandler(stateManager, delegate);

    handler.handleSignalingMessage(
      {
        type: "fileRequest",
        fileId: "file-1",
        offset: 123,
      } as any,
      "peer-1"
    );

    expect(delegate.log).toHaveBeenCalledWith("info", "file_request_received", {
      fileId: "file-1",
      peerId: "peer-1",
      offset: 123,
    });
    expect(delegate.handleFileRequest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    expect(delegate.handleFileRequest).toHaveBeenCalledWith(
      {
        type: "fileRequest",
        fileId: "file-1",
        offset: 123,
      },
      "peer-1"
    );
  });

  it("logs delegate failures when handling a file request", async () => {
    const stateManager = new StateManager();
    const delegate = {
      handleFileRequest: vi.fn(async () => {
        throw new Error("boom");
      }),
      log: vi.fn(),
    };
    const handler = new MessageHandler(stateManager, delegate);

    handler.handleSignalingMessage(
      {
        type: "fileRequest",
        fileId: "file-2",
      } as any,
      "peer-2"
    );

    await vi.advanceTimersByTimeAsync(10);

    expect(delegate.log).toHaveBeenCalledWith(
      "error",
      "file_request_handle_failed",
      {
        fileId: "file-2",
        peerId: "peer-2",
        error: "boom",
      }
    );
  });

  it("marks file transfers complete and emits a final progress callback", () => {
    const stateManager = new StateManager();
    const progressCallback = vi.fn();
    stateManager.updatePeerState("peer-1", {
      isSending: true,
      progressCallback,
    });

    const delegate = {
      handleFileRequest: vi.fn(async () => undefined),
      log: vi.fn(),
    };
    const handler = new MessageHandler(stateManager, delegate);

    handler.handleSignalingMessage(
      {
        type: "fileReceiveComplete",
        fileId: "file-3",
        receivedSize: 2048,
        receivedChunks: 2,
        storeUpdated: true,
      } as any,
      "peer-1"
    );

    expect(stateManager.getPeerState("peer-1").isSending).toBe(false);
    expect(progressCallback).toHaveBeenCalledWith("file-3", 1, 0);
    expect(delegate.log).toHaveBeenCalledWith("info", "file_receive_confirmed", {
      fileId: "file-3",
      receivedSize: 2048,
      storeUpdated: true,
    });
  });

  it("completes folder progress when folder metadata exists and warns when it does not", () => {
    const stateManager = new StateManager();
    const progressCallback = vi.fn();
    stateManager.updatePeerState("peer-1", {
      currentFolderName: "folder-a",
      progressCallback,
    });
    stateManager.addFileToFolder("folder-a", "file-a", 100);

    const delegate = {
      handleFileRequest: vi.fn(async () => undefined),
      log: vi.fn(),
    };
    const handler = new MessageHandler(stateManager, delegate);

    handler.handleSignalingMessage(
      {
        type: "folderReceiveComplete",
        folderName: "folder-a",
        completedFileIds: ["file-a"],
        allStoreUpdated: true,
      } as any,
      "peer-1"
    );

    expect(progressCallback).toHaveBeenCalledWith("folder-a", 1, 0);
    expect(delegate.log).toHaveBeenCalledWith("info", "folder_receive_confirmed", {
      folderName: "folder-a",
      completedFiles: 1,
      allStoreUpdated: true,
    });

    handler.handleSignalingMessage(
      {
        type: "folderReceiveComplete",
        folderName: "missing-folder",
        completedFileIds: [],
        allStoreUpdated: false,
      } as any,
      "peer-1"
    );

    expect(delegate.log).toHaveBeenCalledWith(
      "warn",
      "completed_folder_metadata_missing",
      {
        folderName: "missing-folder",
        peerId: "peer-1",
      }
    );
  });
});
