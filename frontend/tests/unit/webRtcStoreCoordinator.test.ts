import { beforeEach, describe, expect, it } from "vitest";

import {
  clearReceiverRetrievedArtifacts,
  resetReceiverDomainState,
  resetSenderDomainState,
  setSenderRoomSelection,
} from "@/lib/app/WebRTCStoreCoordinator";
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
  activeTab: "send" as const,
  retrieveRoomIdInput: "",
  isDragging: false,
  shareMessage: "",
  retrieveMessage: "",
};

describe("WebRTCStoreCoordinator commands", () => {
  beforeEach(() => {
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
});
