import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProgressTracker } from "@/lib/transfer/ProgressTracker";
import { StateManager } from "@/lib/transfer/StateManager";

describe("ProgressTracker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not update progress for unsent bytes", async () => {
    const stateManager = new StateManager();
    const tracker = new ProgressTracker(stateManager);
    const callback = vi.fn();

    tracker.setProgressCallback(callback, "peer-1");

    await tracker.updateFileProgress(100, "file-1", 200, "peer-1", false);

    expect(stateManager.getFileBytesSent("peer-1", "file-1")).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it("reports file and folder progress through the registered callback", async () => {
    const stateManager = new StateManager();
    const tracker = new ProgressTracker(stateManager);
    const callback = vi.fn();

    tracker.setProgressCallback(callback, "peer-1");

    await tracker.updateFileProgress(100, "file-1", 200, "peer-1");
    expect(stateManager.getFileBytesSent("peer-1", "file-1")).toBe(100);
    expect(callback).toHaveBeenCalledWith(
      "file-1",
      0.5,
      expect.any(Number)
    );

    stateManager.addFileToFolder("folder-a", "file-1", 200);
    stateManager.addFileToFolder("folder-a", "file-2", 100);
    stateManager.updatePeerState("peer-1", { currentFolderName: "folder-a" });

    await tracker.updateFileProgress(100, "file-2", 100, "peer-1");
    expect(callback).toHaveBeenCalledWith(
      "folder-a",
      expect.closeTo(2 / 3, 5),
      expect.any(Number)
    );
  });

  it("completes progress and exposes aggregate stats", () => {
    const stateManager = new StateManager();
    const tracker = new ProgressTracker(stateManager);
    const callback = vi.fn();

    tracker.setProgressCallback(callback, "peer-1");
    stateManager.updatePeerState("peer-1", {
      isSending: true,
      currentFolderName: "folder-a",
    });
    stateManager.updateFileBytesSent("peer-1", "file-1", 50);
    stateManager.updateFileBytesSent("peer-1", "file-2", 25);

    tracker.completeFileProgress("file-1", "peer-1");
    tracker.completeFolderProgress("folder-a", "peer-1");

    expect(callback).toHaveBeenCalledWith("file-1", 1, 0);
    expect(callback).toHaveBeenCalledWith("folder-a", 1, 0);
    expect(tracker.getProgressStats("peer-1")).toMatchObject({
      peerId: "peer-1",
      totalBytesSent: 75,
      activeTransfers: 2,
      currentFolderName: "folder-a",
      isSending: true,
      hasProgressCallback: true,
    });
  });
});
