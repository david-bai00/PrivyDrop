import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProgressReporter } from "@/lib/receive/ProgressReporter";
import { ReceptionStateManager } from "@/lib/receive/ReceptionStateManager";

function createMeta(overrides: Record<string, unknown> = {}) {
  return {
    type: "fileMeta",
    fileId: "file-1",
    name: "file-1.txt",
    size: 200,
    fullName: "file-1.txt",
    folderName: "",
    fileType: "text/plain",
    ...overrides,
  } as any;
}

describe("ProgressReporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports throttled file progress and file completion", async () => {
    const stateManager = new ReceptionStateManager();
    stateManager.setCurrentPeerId("peer-1");
    const completion = stateManager.startFileReception(createMeta(), 4, 50);
    void completion.catch(() => undefined);

    const reporter = new ProgressReporter(stateManager);
    const callback = vi.fn();
    reporter.setProgressCallback(callback);

    reporter.updateFileProgress(50, "file-1", 200);
    expect(callback).toHaveBeenCalledWith("file-1", 0.5, expect.any(Number));

    reporter.updateFileProgress(10, "file-1", 200);
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(101);
    reporter.updateFileProgress(10, "file-1", 200);
    expect(callback).toHaveBeenCalledTimes(2);

    reporter.reportFileComplete("file-1");
    expect(callback).toHaveBeenCalledWith("file-1", 1, expect.any(Number));
  });

  it("reports folder progress, exposes stats, and supports reset helpers", () => {
    const stateManager = new ReceptionStateManager();
    stateManager.setCurrentPeerId("peer-1");
    stateManager.addFileMetadata(createMeta({ fileId: "file-a", folderName: "folder-a", fullName: "folder-a/file-a.txt", size: 100 }));
    stateManager.addFileMetadata(createMeta({ fileId: "file-b", folderName: "folder-a", fullName: "folder-a/file-b.txt", size: 100 }));
    stateManager.setCurrentFolderName("folder-a");
    const completion = stateManager.startFileReception(
      createMeta({ fileId: "file-a", folderName: "folder-a", fullName: "folder-a/file-a.txt", size: 200 }),
      4,
      0
    );
    void completion.catch(() => undefined);

    const reporter = new ProgressReporter(stateManager);
    const callback = vi.fn();
    reporter.setProgressCallback(callback);

    reporter.updateFileProgress(40, "file-a", 200);
    expect(callback).toHaveBeenCalledWith(
      "folder-a",
      0.2,
      expect.any(Number)
    );
    expect(reporter.getCurrentProgress("folder-a")).toBe(0.2);

    reporter.reportFolderComplete("folder-a");
    expect(callback).toHaveBeenCalledWith("folder-a", 1, expect.any(Number));

    const stats = reporter.getProgressStats();
    expect(stats.folderProgress["folder-a"]).toBe(1);
    expect(stats.totalBytesReceived).toBe(40);

    reporter.resetProgress("folder-a");
    expect(reporter.getCurrentProgress("folder-a")).toBe(0);

    reporter.updateFileProgress(10, "file-a", 200);
    expect(reporter.shouldThrottleProgress("folder-a", true)).toBe(true);
    reporter.forceProgressUpdate("folder-a", 0.5);
    expect(callback).toHaveBeenCalledWith("folder-a", 0.5, expect.any(Number));

    reporter.resetAllProgress();
    expect(reporter.getCurrentProgress("folder-a")).toBe(0);
  });

  it("cleans up callback state and returns zero speed without a peer", () => {
    const stateManager = new ReceptionStateManager();
    const reporter = new ProgressReporter(stateManager);
    const callback = vi.fn();
    reporter.setProgressCallback(callback);

    expect(reporter.getCurrentSpeed()).toBe(0);
    reporter.cleanup();
    reporter.reportFileComplete("file-1");
    expect(callback).not.toHaveBeenCalled();
  });
});
