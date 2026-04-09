import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addSenderDraftFiles,
  broadcastPublishedSenderPayload,
  clearReceiverRetrievedArtifacts,
  publishAndBroadcastSenderDraft,
  publishSenderDraftPayload,
  removeSenderDraftFile,
  resetReceiverDomainState,
  resetSenderDomainState,
  setSenderDraftContent,
  setSenderRoomSelection,
} from "@/lib/app/WebRTCStoreCoordinator";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";

const INITIAL_STORE_STATE = {
  shareRoomId: "",
  initShareRoomId: "",
  shareConnectionState: "idle" as const,
  shareLifecycleState: "idle" as const,
  isSenderInRoom: false,
  sharePeerCount: 0,
  retrieveConnectionState: "idle" as const,
  retrieveLifecycleState: "idle" as const,
  isReceiverInRoom: false,
  retrievePeerCount: 0,
  senderDisconnected: false,
  senderDraftContent: "",
  senderDraftFiles: [],
  senderPublishedContent: "",
  senderPublishedFiles: [],
  isSenderPayloadDirty: false,
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

    setSenderDraftContent("hello world");
    const addResult = addSenderDraftFiles([fileA, duplicateFileA, fileB]);

    expect(addResult.addedFiles).toEqual([fileA, fileB]);
    expect(addResult.duplicateFiles).toEqual([duplicateFileA]);
    expect(useFileTransferStore.getState().senderDraftContent).toBe(
      "hello world"
    );
    expect(useFileTransferStore.getState().senderDraftFiles).toEqual([
      fileA,
      fileB,
    ]);
    expect(useFileTransferStore.getState().senderPublishedContent).toBe("");
    expect(useFileTransferStore.getState().senderPublishedFiles).toEqual([]);
    expect(useFileTransferStore.getState().isSenderPayloadDirty).toBe(true);

    removeSenderDraftFile({
      name: "a.txt",
      fullName: "a.txt",
      folderName: "",
      size: 1,
      fileType: "text/plain",
      fileId: "a.txt-1-text/plain-1",
    });

    expect(useFileTransferStore.getState().senderDraftFiles).toEqual([fileB]);
  });

  it("resets sender-owned domain state through the coordinator boundary", () => {
    useFileTransferStore.setState({
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
      senderDisconnected: true,
      receiveProgress: {
        fileA: {
          peerA: { progress: 0.4, speed: 32 },
        },
      },
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
    expect(state.receiveProgress).not.toEqual({});

    resetReceiverDomainState("leave_room");
    state = useFileTransferStore.getState();
    expect(state.senderDisconnected).toBe(false);
    expect(state.receiveProgress).toEqual({});
    expect(state.sendProgress).not.toEqual({});
    expect(state.isAnyFileTransferring).toBe(true);
  });

  it("publishes sender draft payload before broadcasting it", async () => {
    useFileTransferStore.setState({
      senderDraftContent: "draft-payload",
      senderDraftFiles: [
        {
          name: "payload.txt",
          fullName: "payload.txt",
          folderName: "",
          size: 7,
          type: "text/plain",
          lastModified: 7,
        } as any,
      ],
      senderPublishedContent: "old-published",
      senderPublishedFiles: [],
      isSenderPayloadDirty: true,
    });

    const broadcastSpy = vi
      .spyOn(webrtcService, "broadcastDataToAllPeers")
      .mockResolvedValue(true);

    await expect(publishAndBroadcastSenderDraft()).resolves.toBe(true);

    expect(broadcastSpy).toHaveBeenCalledWith(
      "draft-payload",
      useFileTransferStore.getState().senderPublishedFiles
    );
    expect(useFileTransferStore.getState().senderPublishedContent).toBe(
      "draft-payload"
    );
    expect(useFileTransferStore.getState().senderPublishedFiles).toEqual(
      useFileTransferStore.getState().senderDraftFiles
    );
    expect(useFileTransferStore.getState().isSenderPayloadDirty).toBe(false);
  });

  it("broadcasts only the published sender payload snapshot", async () => {
    const publishedFile = {
      name: "published.txt",
      fullName: "published.txt",
      folderName: "",
      size: 9,
      type: "text/plain",
      lastModified: 9,
    } as any;
    const draftFile = {
      name: "draft.txt",
      fullName: "draft.txt",
      folderName: "",
      size: 5,
      type: "text/plain",
      lastModified: 5,
    } as any;

    useFileTransferStore.setState({
      senderDraftContent: "draft-only-change",
      senderDraftFiles: [draftFile],
      senderPublishedContent: "published-payload",
      senderPublishedFiles: [publishedFile],
      isSenderPayloadDirty: true,
    });

    const broadcastSpy = vi
      .spyOn(webrtcService, "broadcastDataToAllPeers")
      .mockResolvedValue(true);

    await expect(broadcastPublishedSenderPayload()).resolves.toBe(true);

    expect(broadcastSpy).toHaveBeenCalledWith("published-payload", [
      publishedFile,
    ]);
  });

  it("marks sender payload as clean after publishing the current draft", () => {
    const draftFile = {
      name: "draft.txt",
      fullName: "draft.txt",
      folderName: "",
      size: 5,
      type: "text/plain",
      lastModified: 5,
    } as any;

    useFileTransferStore.setState({
      senderDraftContent: "draft",
      senderDraftFiles: [draftFile],
      senderPublishedContent: "",
      senderPublishedFiles: [],
      isSenderPayloadDirty: true,
    });

    publishSenderDraftPayload();

    expect(useFileTransferStore.getState().senderPublishedContent).toBe("draft");
    expect(useFileTransferStore.getState().senderPublishedFiles).toEqual([
      draftFile,
    ]);
    expect(useFileTransferStore.getState().isSenderPayloadDirty).toBe(false);
  });
});
