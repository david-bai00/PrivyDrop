import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addSenderFiles,
  broadcastCurrentSenderPayload,
  clearReceiverRetrievedArtifacts,
  removeSenderFile,
  resetReceiverDomainState,
  resetSenderDomainState,
  setSenderShareContent,
  setSenderRoomSelection,
} from "@/lib/app/WebRTCStoreCoordinator";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";

const INITIAL_STORE_STATE = {
  shareRoomId: "",
  initShareRoomId: "",
  shareLink: "",
  shareRoomStatusText: "",
  retrieveRoomStatusText: "",
  shareConnectionState: "idle" as const,
  shareLifecycleState: "idle" as const,
  isSenderInRoom: false,
  sharePeerCount: 0,
  retrieveConnectionState: "idle" as const,
  retrieveLifecycleState: "idle" as const,
  isReceiverInRoom: false,
  retrievePeerCount: 0,
  senderDisconnected: false,
  shareContent: "",
  sendFiles: [],
  retrievedContent: "",
  retrievedFiles: [],
  retrievedFileMetas: [],
  sendProgress: {},
  receiveProgress: {},
  isAnyFileTransferring: false,
};

describe("WebRTCStoreCoordinator commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useFileTransferStore.setState(INITIAL_STORE_STATE);
  });

  it("updates sender room selection and can mark the room as initial", () => {
    setSenderRoomSelection("room-a");
    expect(useFileTransferStore.getState().shareRoomId).toBe("room-a");
    expect(useFileTransferStore.getState().initShareRoomId).toBe("");

    setSenderRoomSelection("room-b", { markAsInitial: true });
    expect(useFileTransferStore.getState().shareRoomId).toBe("room-b");
    expect(useFileTransferStore.getState().initShareRoomId).toBe("room-b");
  });

  it("updates sender payload through the coordinator boundary", () => {
    const fileA = {
      name: "a.txt",
      fullName: "a.txt",
      folderName: "",
      size: 1,
      type: "text/plain",
      lastModified: 1,
    } as any;
    const duplicateFileA = {
      name: "a-copy.txt",
      fullName: "a.txt",
      folderName: "",
      size: 1,
      type: "text/plain",
      lastModified: 1,
    } as any;
    const fileB = {
      name: "b.txt",
      fullName: "folder/b.txt",
      folderName: "folder",
      size: 2,
      type: "text/plain",
      lastModified: 2,
    } as any;

    setSenderShareContent("hello world");
    const addResult = addSenderFiles([fileA, duplicateFileA, fileB]);

    expect(addResult.addedFiles).toEqual([fileA, fileB]);
    expect(addResult.duplicateFiles).toEqual([duplicateFileA]);
    expect(useFileTransferStore.getState().shareContent).toBe("hello world");
    expect(useFileTransferStore.getState().sendFiles).toEqual([fileA, fileB]);

    removeSenderFile({
      name: "a.txt",
      fullName: "a.txt",
      folderName: "",
      size: 1,
      fileType: "text/plain",
      fileId: "a.txt-1-text/plain-1",
    });

    expect(useFileTransferStore.getState().sendFiles).toEqual([fileB]);
  });

  it("resets sender-owned domain state through the coordinator boundary", () => {
    useFileTransferStore.setState({
      shareLink: "https://example.test/share/room-a",
      shareRoomStatusText: "sender-active",
      sendProgress: {
        fileA: {
          peerA: { progress: 0.5, speed: 128 },
        },
      },
      retrievedContent: "keep-me",
      retrievedFiles: [{ name: "keep.txt" } as any],
      retrievedFileMetas: [{ fileId: "keep" } as any],
      receiveProgress: {
        fileB: {
          peerB: { progress: 0.2, speed: 64 },
        },
      },
      isAnyFileTransferring: true,
    });

    resetSenderDomainState("reset_app");

    const state = useFileTransferStore.getState();
    expect(state.shareLink).toBe("");
    expect(state.shareRoomStatusText).toBe("");
    expect(state.sendProgress).toEqual({});
    expect(state.retrievedContent).toBe("keep-me");
    expect(state.retrievedFiles).toHaveLength(1);
    expect(state.retrievedFileMetas).toHaveLength(1);
    expect(state.isAnyFileTransferring).toBe(true);
  });

  it("resets receiver-owned domain state and can clear retrieved artifacts only", () => {
    useFileTransferStore.setState({
      retrievedContent: "hello",
      retrievedFiles: [{ name: "a.txt" } as any],
      retrievedFileMetas: [{ fileId: "file-a" } as any],
      retrieveRoomStatusText: "receiver-active",
      senderDisconnected: true,
      receiveProgress: {
        fileA: {
          peerA: { progress: 0.4, speed: 32 },
        },
      },
      shareLink: "https://example.test/share/room-a",
      sendProgress: {
        fileB: {
          peerB: { progress: 0.7, speed: 64 },
        },
      },
      isAnyFileTransferring: true,
    });

    clearReceiverRetrievedArtifacts();
    let state = useFileTransferStore.getState();
    expect(state.retrievedContent).toBe("");
    expect(state.retrievedFiles).toEqual([]);
    expect(state.retrievedFileMetas).toEqual([]);
    expect(state.retrieveRoomStatusText).toBe("receiver-active");
    expect(state.receiveProgress).not.toEqual({});

    resetReceiverDomainState("leave_room");
    state = useFileTransferStore.getState();
    expect(state.retrieveRoomStatusText).toBe("");
    expect(state.senderDisconnected).toBe(false);
    expect(state.receiveProgress).toEqual({});
    expect(state.shareLink).toBe("https://example.test/share/room-a");
    expect(state.sendProgress).not.toEqual({});
    expect(state.isAnyFileTransferring).toBe(true);
  });

  it("broadcasts the current sender payload through the coordinator boundary", async () => {
    useFileTransferStore.setState({
      shareContent: "payload",
      sendFiles: [
        {
          name: "payload.txt",
          fullName: "payload.txt",
          folderName: "",
          size: 7,
          type: "text/plain",
          lastModified: 7,
        } as any,
      ],
    });

    const broadcastSpy = vi
      .spyOn(webrtcService, "broadcastDataToAllPeers")
      .mockResolvedValue(true);

    await expect(broadcastCurrentSenderPayload()).resolves.toBe(true);

    expect(broadcastSpy).toHaveBeenCalledWith(
      "payload",
      useFileTransferStore.getState().sendFiles
    );
  });
});
