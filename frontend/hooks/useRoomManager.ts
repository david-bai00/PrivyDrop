import { useCallback, useEffect, useRef } from "react";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { fetchRoom, createRoom, checkRoom, leaveRoom } from "@/app/config/api";
import { debounce } from "lodash";
import { useOneShotSlowHint } from "@/utils/useOneShotSlowHint";
import type { RoomManagerText } from "@/types/clipboardText";

function format_peopleMsg(template: string, peerCount: number) {
  return template.replace("{peerCount}", peerCount.toString());
}

// Remove all WebRTC related props dependencies
interface UseRoomManagerProps {
  text: RoomManagerText;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useRoomManager({
  text,
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

  // A ref to indicate join side for slow-hint message orientation
  const joinSideRef = useRef<boolean>(true);

  // One-shot join slow hint (3s), per join attempt
  const { arm: armJoinSlow, disarm: disarmJoinSlow, reset: resetJoinSlow } = useOneShotSlowHint({
    thresholdMs: 3000,
    putMessageInMs,
    displayMs: 6000,
    getMessage: () => {
      return { text: text.join.slow, isShareEnd: joinSideRef.current };
    },
    visibilityGate: true,
  });

  // Join room method - directly use webrtcService
  const joinRoom = useCallback(
    async (isSenderSide: boolean, roomId: string) => {
      // UI: Joining feedback and slow network hint (one-shot)
      joinSideRef.current = isSenderSide;
      resetJoinSlow();

      try {
        // Immediate feedback on click
        putMessageInMs(text.join.inProgress, isSenderSide, 6000);

        // 3s slow-network hint
        armJoinSlow("join");

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
                text.join.duplicate,
                isSenderSide
              );
              disarmJoinSlow();
              return;
            }
            setShareRoomId(roomId);
          } catch (error) {
            putMessageInMs(
              text.join.failure +
                  ` (Create room error)`,
              isSenderSide
            );
            disarmJoinSlow();
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
          isSenderSide &&
          typeof actualRoomId === "string" &&
          actualRoomId.length >= 8;

        // Directly call the service method without dependency injection
        await webrtcService.joinRoom(
          actualRoomId,
          isSenderSide,
          forceInitiatorOnline
        );

        disarmJoinSlow();
        putMessageInMs(
          text.join.success,
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
        let errorMsg = text.join.failure;
        if (error instanceof Error) {
          errorMsg =
            error.message === "Room does not exist"
              ? text.join.notFound
              : error.message === "Join room timeout"
              ? text.join.timeout
              : `${text.join.failure} ${error.message}`;
         }
        // Clear joining slow-hint on failure
        disarmJoinSlow();
        putMessageInMs(errorMsg, isSenderSide);
      }
    },
    [
      text,
      putMessageInMs,
      activeTab,
      initShareRoomId,
      shareRoomId,
      setShareRoomId,
      setShareLink,
      armJoinSlow,
      disarmJoinSlow,
      resetJoinSlow,
    ]
  );

  // Generate share link and broadcast
  const generateShareLinkAndBroadcast = useCallback(async () => {
    if (!shareRoomId) return;

    try {
      if (sharePeerCount === 0) {
        putMessageInMs(text.messages.waiting, true);
      } else {
        // Directly call the service's broadcast method
        await webrtcService.broadcastDataToAllPeers();
      }

      // Update share link
      const link = `${window.location.origin}${window.location.pathname}?roomId=${shareRoomId}`;
      setShareLink(link);
    } catch (error) {
      console.error("[RoomManager] Failed to generate share link:", error);
      putMessageInMs(text.messages.generateShareLinkError, true);
    }
  }, [text.messages.generateShareLinkError, text.messages.waiting, putMessageInMs, shareRoomId, sharePeerCount, setShareLink]);

  const handleLeaveReceiverRoom = useCallback(async () => {
    if (isAnyFileTransferring) {
      const confirmed = window.confirm(text.messages.confirmLeave);
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
        ? text.messages.leaveSuccess
        : text.status.leftRoom;
      putMessageInMs(message, false);

      // Reset receiver state (clears all as per requirement)
      resetReceiverState();

      // Clean up WebRTC connection
      await webrtcService.leaveRoom(false);
    } catch (error) {
      console.error("[RoomManager] Receiver failed to leave room:", error);
      putMessageInMs(text.messages.leaveRoomError, true);
    }
  }, [isAnyFileTransferring, putMessageInMs, resetReceiverState, text.messages.confirmLeave, text.messages.leaveRoomError, text.messages.leaveSuccess, text.status.leftRoom]);

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
      putMessageInMs(text.messages.resetSenderStateError, true);
    }
  }, [putMessageInMs, resetSenderApp, setShareRoomId, setInitShareRoomId, text.messages.resetSenderStateError]);

  const handleLeaveSenderRoom = useCallback(async () => {
    if (isAnyFileTransferring) {
      const confirmed = window.confirm(text.messages.confirmLeave);
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
        ? text.messages.leaveSuccess
        : text.status.leftRoom;
      putMessageInMs(message, true);

      // Reset sender state and get new room ID (keeps files as per requirement)
      await resetSenderAppState();
    } catch (error) {
      console.error("[RoomManager] Sender failed to leave room:", error);
      putMessageInMs(text.messages.leaveRoomError, true);
    }
  }, [isAnyFileTransferring, putMessageInMs, resetSenderAppState, text.messages.confirmLeave, text.messages.leaveRoomError, text.messages.leaveSuccess, text.status.leftRoom]);

  // Room ID input processing
  const processRoomIdInput = useCallback(
    debounce(async (input: string) => {
      if (!input.trim()) return;

      try {
        const isValid = await checkRoom(input);
        if (isValid) {
          setShareRoomId(input);
          putMessageInMs(text.roomCheck.available, true);
        } else {
          putMessageInMs(text.roomCheck.notAvailable, true);
        }
      } catch (error) {
        console.error("[RoomManager] Failed to validate room:", error);
        putMessageInMs(text.messages.validateRoomError, true);
      }
    }, 750),
    [putMessageInMs, setShareRoomId, text.messages.validateRoomError, text.roomCheck.available, text.roomCheck.notAvailable]
  );

  // Initialize sender room ID
  useEffect(() => {
    if (
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
          putMessageInMs(text.messages.fetchRoomError, true);
        }
      };
      initNewRoom();
    }
  }, [
    text.messages.fetchRoomError,
    putMessageInMs,
    initShareRoomId,
    activeTab,
    setShareRoomId,
    setInitShareRoomId,
  ]);

  // Room status text update
  useEffect(() => {
    const isInRoom = activeTab === "send" ? isSenderInRoom : isReceiverInRoom;
    const currentPeerCount =
      activeTab === "send" ? sharePeerCount : retrievePeerCount;
    let statusText = "";

    if (!isInRoom) {
      statusText =
        activeTab === "retrieve"
          ? text.status.receiverCanAccept
          : text.status.roomEmpty;
    } else if (currentPeerCount === 0) {
      statusText = text.status.onlyOne;
    } else {
      statusText =
        activeTab === "send"
          ? format_peopleMsg(text.status.peopleCount, currentPeerCount + 1)
          : text.status.connected;
    }

    if (activeTab === "send") setShareRoomStatusText(statusText);
    else setRetrieveRoomStatusText(statusText);
  }, [
    activeTab,
    sharePeerCount,
    retrievePeerCount,
    text.status.connected,
    text.status.onlyOne,
    text.status.peopleCount,
    text.status.receiverCanAccept,
    text.status.roomEmpty,
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
