import { describe, expect, it } from "vitest";

import { ReceptionStateManager } from "@/lib/receive/ReceptionStateManager";

function buildFileMeta(overrides?: Partial<any>) {
  return {
    type: "fileMeta",
    name: "a.txt",
    size: 10,
    fullName: "a.txt",
    folderName: "",
    fileType: "file",
    fileId: "file-a",
    ...overrides,
  };
}

describe("ReceptionStateManager.addFileMetadata", () => {
  it("returns true for new metadata and false for duplicates", () => {
    const manager = new ReceptionStateManager();
    const meta = buildFileMeta({ fileId: "file-1" });

    expect(manager.addFileMetadata(meta)).toBe(true);
    expect(manager.addFileMetadata(meta)).toBe(false);
    expect(manager.getFileMetadata("file-1")).toEqual(meta);
  });

  it("updates folder progress when folderName is present", () => {
    const manager = new ReceptionStateManager();
    const meta1 = buildFileMeta({
      fileId: "f1",
      size: 3,
      folderName: "folder",
      fullName: "folder/a.txt",
    });
    const meta2 = buildFileMeta({
      fileId: "f2",
      size: 7,
      folderName: "folder",
      fullName: "folder/b.txt",
    });

    manager.addFileMetadata(meta1);
    manager.addFileMetadata(meta2);

    const folder = manager.getFolderProgress("folder");
    expect(folder).toEqual({
      totalSize: 10,
      receivedSize: 0,
      fileIds: ["f1", "f2"],
    });

    manager.updateFolderReceivedSize("folder", 5);
    expect(manager.getFolderProgress("folder")!.receivedSize).toBe(5);

    manager.setFolderReceivedSize("folder", 9);
    expect(manager.getFolderProgress("folder")!.receivedSize).toBe(9);
  });
});

describe("ReceptionStateManager.startFileReception", () => {
  it("throws when starting while not idle", async () => {
    const manager = new ReceptionStateManager();
    manager.setLifecycleState("disconnecting");

    expect(() => manager.startFileReception(buildFileMeta(), 1, 0)).toThrow(
      "Cannot start file reception while receiver is disconnecting"
    );
  });

  it("throws when there is already an active reception", async () => {
    const manager = new ReceptionStateManager();
    const promise = manager.startFileReception(buildFileMeta(), 1, 0);
    expect(manager.getLifecycleState()).toBe("receiving");
    expect(manager.getActiveFileReception()).not.toBeNull();

    expect(() =>
      manager.startFileReception(buildFileMeta({ fileId: "file-b" }), 1, 0)
    ).toThrow("Another file reception is already in progress");

    manager.failFileReception(new Error("stop"));
    await expect(promise).rejects.toBeInstanceOf(Error);
  });

  it("transitions to receiving and returns a promise resolved on completion", async () => {
    const manager = new ReceptionStateManager();
    const promise = manager.startFileReception(buildFileMeta(), 2, 0);

    expect(manager.getLifecycleState()).toBe("receiving");
    expect(manager.getActiveFileReception()!.expectedChunksCount).toBe(2);

    manager.completeFileReception();
    expect(manager.getLifecycleState()).toBe("idle");
    expect(manager.getActiveFileReception()).toBeNull();

    await expect(promise).resolves.toBeUndefined();
  });
});

describe("ReceptionStateManager.resetState", () => {
  it("clears metadata, saveType, active state, and context by default but preserves saveDirectory", () => {
    const manager = new ReceptionStateManager();
    manager.addFileMetadata(buildFileMeta({ fileId: "file-1", size: 1 }));
    manager.setSaveType("file-1", true);
    manager.setCurrentFolderName("folder");
    manager.setCurrentPeerId("peer-1");
    manager.setSaveDirectory({} as any);

    manager.resetState();

    expect(manager.getAllFileMetadata().size).toBe(0);
    expect(manager.getAllFolderProgresses()).toEqual({});
    expect(manager.getSaveType("file-1")).toBe(false);
    expect(manager.getActiveFileReception()).toBeNull();
    expect(manager.getActiveStringReception()).toBeNull();
    expect(manager.getCurrentFolderName()).toBeNull();
    expect(manager.getCurrentPeerId()).toBe("");
    expect(manager.getLifecycleState()).toBe("idle");
    expect(manager.getSaveDirectory()).not.toBeNull();
  });

  it("preserves metadata/saveType/saveDirectory when requested", () => {
    const manager = new ReceptionStateManager();
    manager.addFileMetadata(buildFileMeta({ fileId: "file-1", size: 1 }));
    manager.setSaveType("file-1", true);
    const directory = {} as any;
    manager.setSaveDirectory(directory);
    manager.setCurrentPeerId("peer-1");

    manager.resetState({
      preserveMetadata: true,
      preserveSaveType: true,
      preserveSaveDirectory: true,
    });

    expect(manager.getAllFileMetadata().size).toBe(1);
    expect(manager.getFileMetadata("file-1")!.fileId).toBe("file-1");
    expect(manager.getSaveType("file-1")).toBe(true);
    expect(manager.getSaveDirectory()).toBe(directory);
    expect(manager.getCurrentPeerId()).toBe("");
  });

  it("clears saveDirectory only when preserveSaveDirectory is false", () => {
    const manager = new ReceptionStateManager();
    manager.setSaveDirectory({} as any);

    manager.resetState({ preserveSaveDirectory: false });
    expect(manager.getSaveDirectory()).toBeNull();
  });
});

describe("ReceptionStateManager.getStateStats", () => {
  it("returns counts consistent with internal state", () => {
    const manager = new ReceptionStateManager();
    manager.addFileMetadata(buildFileMeta({ fileId: "file-1", size: 1 }));
    manager.addFileMetadata(
      buildFileMeta({ fileId: "file-2", size: 2, folderName: "folder" })
    );
    manager.setSaveType("file-2", true);

    const stats = manager.getStateStats();
    expect(stats.pendingFilesCount).toBe(2);
    expect(stats.folderCount).toBe(1);
    expect(stats.saveTypeCount).toBe(1);
  });
});
