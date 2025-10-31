import { useCallback, useEffect } from "react";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { fetchRoom, createRoom, checkRoom, leaveRoom } from "@/app/config/api";
import { debounce } from "lodash";
import type { Messages } from "@/types/messages";

function format_peopleMsg(template: string, peerCount: number) {
  return template.replace("{peerCount}", peerCount.toString());
}

// Remove all WebRTC related props dependencies
interface UseRoomManagerProps {
  messages: Messages | null;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useRoomManager({
  messages,
  putMessageInMs,
}: UseRoomManagerProps) {
  // Get state from store
  const {
    shareRoomId,
    initShareRoomId,
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    activeTab,
    sharePeerCount,
    retrievePeerCount,
    senderDisconnected,
    isSenderInRoom,
    isReceiverInRoom,
    isAnyFileTransferring,
    setShareRoomId,
    setInitShareRoomId,
    setShareLink,
    setShareRoomStatusText,
    setRetrieveRoomStatusText,
    resetReceiverState,
    resetSenderApp,
  } = useFileTransferStore();

  // Join room method - directly use webrtcService
  const joinRoom = useCallback(
    async (isSenderSide: boolean, roomId: string) => {
      if (!messages) return;

      try {
        // If it's the sender side and the room ID is not the initial ID, need to create the room first
        if (
          isSenderSide &&
          activeTab === "send" &&
          roomId !== initShareRoomId
        ) {
          try {
            const success = await createRoom(roomId);
            if (!success) {
              putMessageInMs(
                messages.text.ClipboardApp.joinRoom.DuplicateMsg,
                isSenderSide
              );
              return;
            }
            setShareRoomId(roomId);
          } catch (error) {
            putMessageInMs(
              messages.text.ClipboardApp.joinRoom.failMsg +
                ` (Create room error)`,
              isSenderSide
            );
            return;
          }
        }

        // Determine the actual room ID to join
        const actualRoomId =
          isSenderSide && roomId !== initShareRoomId
            ? roomId
            : isSenderSide
            ? shareRoomId
            : roomId;

        // If sender uses a long ID (e.g., cached UUID), proactively send
        // "initiator-online" after join to trigger receivers' re-handshake.
        const forceInitiatorOnline =
          isSenderSide && typeof actualRoomId === "string" && actualRoomId.length >= 8;

        // Directly call the service method without dependency injection
        await webrtcService.joinRoom(
          actualRoomId,
          isSenderSide,
          forceInitiatorOnline
        );

        putMessageInMs(
          messages.text.ClipboardApp.joinRoom.successMsg,
          isSenderSide,
          6000
        );

        // Update share link
        if (isSenderSide) {
          const link = `${window.location.origin}${window.location.pathname}?roomId=${actualRoomId}`;
          setShareLink(link);
          if (actualRoomId !== shareRoomId) {
            setShareRoomId(actualRoomId);
          }
        }
      } catch (error) {
        console.error("[RoomManager] Failed to join room:", error);
        let errorMsg = messages.text.ClipboardApp.joinRoom.failMsg;
        if (error instanceof Error) {
          errorMsg =
            error.message === "Room does not exist"
              ? messages.text.ClipboardApp.joinRoom.notExist
              : `${messages.text.ClipboardApp.joinRoom.failMsg} ${error.message}`;
        }
        putMessageInMs(errorMsg, isSenderSide);
      }
    },
    [
      messages,
      putMessageInMs,
      activeTab,
      initShareRoomId,
      shareRoomId,
      setShareRoomId,
      setShareLink,
    ]
  );

  // Generate share link and broadcast
  const generateShareLinkAndBroadcast = useCallback(async () => {
    if (!messages || !shareRoomId) return;

    try {
      if (sharePeerCount === 0) {
        putMessageInMs(messages.text.ClipboardApp.waitting_tips, true);
      } else {
        // Directly call the service's broadcast method
        await webrtcService.broadcastDataToAllPeers();
      }

      // Update share link
      const link = `${window.location.origin}${window.location.pathname}?roomId=${shareRoomId}`;
      setShareLink(link);
    } catch (error) {
      console.error("[RoomManager] Failed to generate share link:", error);
      putMessageInMs("Failed to generate share link", true);
    }
  }, [messages, putMessageInMs, shareRoomId, sharePeerCount, setShareLink]);

  // Receiver leave room
  const handleLeaveReceiverRoom = useCallback(async () => {
    if (!messages) return;

    // Check if files are transferring and show confirmation
    if (isAnyFileTransferring) {
      const confirmed = window.confirm(messages.text.ClipboardApp.confirmLeaveWhileTransferring);
      if (!confirmed) return;
    }

    try {
      // Call backend API to leave room
      if (webrtcService.receiver.roomId && webrtcService.receiver.peerId) {
        await leaveRoom(
          webrtcService.receiver.roomId,
          webrtcService.receiver.peerId
        );
      }

      const message = isAnyFileTransferring 
        ? messages.text.ClipboardApp.leaveWhileTransferringSuccess
        : messages.text.ClipboardApp.roomStatus.leftRoomMsg;
      putMessageInMs(message, false);

      // Reset receiver state (clears all as per requirement)
      resetReceiverState();

      // Clean up WebRTC connection
      await webrtcService.leaveRoom(false);
    } catch (error) {
      console.error("[RoomManager] Receiver failed to leave room:", error);
      putMessageInMs("Failed to leave room", true);
    }
  }, [messages, putMessageInMs, resetReceiverState, isAnyFileTransferring]);

  // Sender reset app state
  const resetSenderAppState = useCallback(async () => {
    try {
      // 1. Clean up WebRTC connection
      await webrtcService.leaveRoom(true);

      // 2. Clear share link and progress
      resetSenderApp();

      // 3. Fetch new room ID from backend
      const newRoomId = await fetchRoom();
      setShareRoomId(newRoomId || "");
      setInitShareRoomId(newRoomId || "");
    } catch (error) {
      console.error("[RoomManager] Failed to reset sender state:", error);
      putMessageInMs("Failed to reset sender state", true);
    }
  }, [putMessageInMs, resetSenderApp, setShareRoomId, setInitShareRoomId]);

  // Sender leave room
  const handleLeaveSenderRoom = useCallback(async () => {
    if (!messages) return;

    // Check if files are transferring and show confirmation
    if (isAnyFileTransferring) {
      const confirmed = window.confirm(messages.text.ClipboardApp.confirmLeaveWhileTransferring);
      if (!confirmed) return;
    }

    try {
      // Call backend API to leave room
      if (webrtcService.sender.roomId && webrtcService.sender.peerId) {
        await leaveRoom(
          webrtcService.sender.roomId,
          webrtcService.sender.peerId
        );
      }

      const message = isAnyFileTransferring 
        ? messages.text.ClipboardApp.leaveWhileTransferringSuccess
        : messages.text.ClipboardApp.roomStatus.leftRoomMsg;
      putMessageInMs(message, true);

      // Reset sender state and get new room ID (keeps files as per requirement)
      await resetSenderAppState();
    } catch (error) {
      console.error("[RoomManager] Sender failed to leave room:", error);
      putMessageInMs("Failed to leave room", true);
    }
  }, [messages, putMessageInMs, resetSenderAppState, isAnyFileTransferring]);

  // Room ID input processing
    const processRoomIdInput = useCallback(
    debounce(async (input: string) => {
      if (!input.trim() || !messages) return;

      try {
        const isValid = await checkRoom(input);
        if (isValid) {
          setShareRoomId(input);
          putMessageInMs(
            messages.text.ClipboardApp.roomCheck.available_msg,
            true
          );
        } else {
          putMessageInMs(
            messages.text.ClipboardApp.roomCheck.notAvailable_msg,
            true
          );
        }
      } catch (error) {
        console.error("[RoomManager] Failed to validate room:", error);
        putMessageInMs("Failed to validate room", true);
      }
    }, 750),
    [messages, putMessageInMs, setShareRoomId]
  );

  // Initialize sender room ID
  useEffect(() => {
    if (
      messages &&
      putMessageInMs &&
      !initShareRoomId &&
      activeTab === "send"
    ) {
      const initNewRoom = async () => {
        try {
          const newRoomId = await fetchRoom();
          setShareRoomId(newRoomId || "");
          setInitShareRoomId(newRoomId || "");
        } catch (err) {
          console.error("[RoomManager] Failed to fetch initial room:", err);
          const errorMsg =
            messages.text?.ClipboardApp?.fetchRoom_err ||
            "Failed to fetch room ID";
          putMessageInMs(errorMsg, true);
        }
      };
      initNewRoom();
    }
  }, [
    messages,
    putMessageInMs,
    initShareRoomId,
    activeTab,
    setShareRoomId,
    setInitShareRoomId,
  ]);

  // Room status text update
  useEffect(() => {
    if (!messages) {
      if (activeTab === "send") setShareRoomStatusText("");
      else setRetrieveRoomStatusText("");
      return;
    }

    const isInRoom = activeTab === "send" ? isSenderInRoom : isReceiverInRoom;
    const currentPeerCount =
      activeTab === "send" ? sharePeerCount : retrievePeerCount;
    let statusText = "";

    if (!isInRoom) {
      statusText =
        activeTab === "retrieve"
          ? messages.text.ClipboardApp.roomStatus.receiverEmptyMsg
          : messages.text.ClipboardApp.roomStatus.senderEmptyMsg;
    } else if (currentPeerCount === 0) {
      statusText = messages.text.ClipboardApp.roomStatus.onlyOneMsg;
    } else {
      statusText =
        activeTab === "send"
          ? format_peopleMsg(
              messages.text.ClipboardApp.roomStatus.peopleMsg_template,
              currentPeerCount + 1
            )
          : messages.text.ClipboardApp.roomStatus.connected_dis;
    }

    if (activeTab === "send") setShareRoomStatusText(statusText);
    else setRetrieveRoomStatusText(statusText);
  }, [
    activeTab,
    sharePeerCount,
    retrievePeerCount,
    messages,
    senderDisconnected,
    isSenderInRoom,
    isReceiverInRoom,
    setShareRoomStatusText,
    setRetrieveRoomStatusText,
  ]);

  return {
    // State
    shareRoomId,
    initShareRoomId,
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    sharePeerCount,
    retrievePeerCount,
    senderDisconnected,
    isSenderInRoom,
    isReceiverInRoom,

    // Methods
    processRoomIdInput,
    joinRoom,
    generateShareLinkAndBroadcast,
    handleLeaveReceiverRoom,
    handleLeaveSenderRoom,
  };
}
