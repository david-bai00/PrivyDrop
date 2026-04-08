import { beforeEach, describe, expect, it } from "vitest";

import { getReceiverShutdownPolicy } from "@/lib/receive/receiverShutdown";
import { getSenderShutdownPolicy } from "@/lib/transfer/senderShutdown";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import {
  getReceiverStoreResetPolicy,
  getSenderStoreResetPolicy,
} from "@/stores/transferStoreReset";

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

describe("shutdown matrix consistency", () => {
  beforeEach(() => {
    useFileTransferStore.setState(INITIAL_STORE_STATE);
  });

  it("keeps sender shutdown and store reset actions aligned", () => {
    const senderActions = ["leave_room", "reset_app", "cleanup"] as const;

    for (const action of senderActions) {
      const shutdownPolicy = getSenderShutdownPolicy(action);
      const storePolicy = getSenderStoreResetPolicy(action);

      expect(shutdownPolicy.action).toBe(action);
      expect(storePolicy.action).toBe(action);
      expect(shutdownPolicy.clearTransferState).toBe(
        storePolicy.clearSendProgress
      );

      if (action === "cleanup") {
        expect(shutdownPolicy.keepSocketAlive).toBe(false);
      } else {
        expect(shutdownPolicy.keepSocketAlive).toBe(true);
      }

      expect(storePolicy.clearShareLink).toBe(true);
      expect(storePolicy.clearShareRoomStatusText).toBe(true);
    }
  });

  it("keeps receiver room-exit shutdown and store reset actions aligned", () => {
    const roomExitActions = ["leave_room", "cleanup"] as const;

    for (const action of roomExitActions) {
      const shutdownPolicy = getReceiverShutdownPolicy(action);
      const storePolicy = getReceiverStoreResetPolicy(action);

      expect(shutdownPolicy.action).toBe(action);
      expect(storePolicy.action).toBe(action);
      expect(shutdownPolicy.allowResume).toBe(false);
      expect(shutdownPolicy.resetProgress).toBe(
        storePolicy.clearReceiveProgress
      );
      expect(storePolicy.clearRetrievedContent).toBe(true);
      expect(storePolicy.clearRetrievedFiles).toBe(true);
      expect(storePolicy.clearRetrievedFileMetas).toBe(true);
      expect(storePolicy.clearRetrieveRoomStatusText).toBe(true);
      expect(storePolicy.clearSenderDisconnected).toBe(true);
    }
  });

  it("keeps peer_disconnect as the only resume-preserving receiver action", () => {
    const peerDisconnect = getReceiverShutdownPolicy("peer_disconnect");
    const forceReset = getReceiverShutdownPolicy("force_reset");
    const leaveRoom = getReceiverShutdownPolicy("leave_room");
    const cleanup = getReceiverShutdownPolicy("cleanup");

    expect(peerDisconnect.allowResume).toBe(true);
    expect(peerDisconnect.preserveMetadata).toBe(true);
    expect(peerDisconnect.preserveSaveType).toBe(true);
    expect(peerDisconnect.preserveSaveDirectory).toBe(true);
    expect(peerDisconnect.disposeProcessors).toBe(false);

    expect(forceReset.allowResume).toBe(false);
    expect(leaveRoom.allowResume).toBe(false);
    expect(cleanup.allowResume).toBe(false);
  });

  it("sender store reset clears only sender-owned state", () => {
    useFileTransferStore.setState({
      shareLink: "https://example.test/share/room-a",
      shareRoomStatusText: "sender-active",
      sendProgress: {
        sendFile: {
          peerA: { progress: 0.5, speed: 128 },
        },
      },
      retrievedContent: "keep-me",
      retrievedFiles: [{ name: "kept.txt" } as any],
      retrievedFileMetas: [{ name: "kept.txt", size: 1 } as any],
      receiveProgress: {
        receiveFile: {
          peerB: { progress: 0.25, speed: 64 },
        },
      },
      senderDisconnected: true,
      isAnyFileTransferring: true,
    });

    useFileTransferStore.getState().applySenderStoreReset("reset_app");

    const state = useFileTransferStore.getState();

    expect(state.shareLink).toBe("");
    expect(state.shareRoomStatusText).toBe("");
    expect(state.sendProgress).toEqual({});
    expect(state.retrievedContent).toBe("keep-me");
    expect(state.retrievedFiles).toEqual([{ name: "kept.txt" }]);
    expect(state.retrievedFileMetas).toEqual([{ name: "kept.txt", size: 1 }]);
    expect(state.receiveProgress).toEqual({
      receiveFile: {
        peerB: { progress: 0.25, speed: 64 },
      },
    });
    expect(state.senderDisconnected).toBe(true);
    expect(state.isAnyFileTransferring).toBe(true);
  });

  it("receiver store reset clears only receiver-owned state", () => {
    useFileTransferStore.setState({
      shareLink: "https://example.test/share/room-a",
      shareRoomStatusText: "keep-sender",
      sendProgress: {
        sendFile: {
          peerA: { progress: 0.5, speed: 128 },
        },
      },
      retrievedContent: "clear-me",
      retrievedFiles: [{ name: "clear.txt" } as any],
      retrievedFileMetas: [{ name: "clear.txt", size: 2 } as any],
      retrieveRoomStatusText: "receiver-active",
      receiveProgress: {
        receiveFile: {
          peerB: { progress: 0.25, speed: 64 },
        },
      },
      senderDisconnected: true,
      isAnyFileTransferring: true,
    });

    useFileTransferStore.getState().applyReceiverStoreReset("leave_room");

    const state = useFileTransferStore.getState();

    expect(state.retrievedContent).toBe("");
    expect(state.retrievedFiles).toEqual([]);
    expect(state.retrievedFileMetas).toEqual([]);
    expect(state.retrieveRoomStatusText).toBe("");
    expect(state.retrievePeerCount).toBe(0);
    expect(state.receiveProgress).toEqual({});
    expect(state.senderDisconnected).toBe(false);
    expect(state.shareLink).toBe("https://example.test/share/room-a");
    expect(state.shareRoomStatusText).toBe("keep-sender");
    expect(state.sendProgress).toEqual({
      sendFile: {
        peerA: { progress: 0.5, speed: 128 },
      },
    });
    expect(state.isAnyFileTransferring).toBe(true);
  });
});
