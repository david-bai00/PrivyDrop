import { useCallback, useEffect, useRef } from "react";
import {
  ensureWebRTCStoreCoordinator,
  publishAndBroadcastSenderDraft,
  resetReceiverDomainState,
  resetSenderDomainState,
  setSenderRoomSelection,
} from "@/lib/app/WebRTCStoreCoordinator";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { useClipboardUiStore } from "@/stores/clipboardUiStore";
import { fetchRoom, createRoom, checkRoom, leaveRoom } from "@/app/config/api";
import { debounce } from "lodash";
import { useOneShotSlowHint } from "@/utils/useOneShotSlowHint";
import type { RoomManagerText } from "@/types/clipboardText";
import {
  useClipboardAppMessageDispatcher,
  type SideMessageDispatcher,
} from "@/hooks/useClipboardAppMessages";

ensureWebRTCStoreCoordinator();

// Remove all WebRTC related props dependencies
interface UseRoomManagerProps {
  text: RoomManagerText;
}

export function useRoomManager({ text }: UseRoomManagerProps) {
  const showSenderMessage = useClipboardAppMessageDispatcher("sender");
  const showReceiverMessage = useClipboardAppMessageDispatcher("receiver");
  // Get state from store
  const {
    shareRoomId,
    initShareRoomId,
    sharePeerCount,
    retrievePeerCount,
    senderDisconnected,
    isSenderInRoom,
    isReceiverInRoom,
    isAnyFileTransferring,
  } = useFileTransferStore();
  const { activeTab } = useClipboardUiStore();

  // Track the active join-side dispatcher for one-shot slow hints.
  const joinMessageRef = useRef<SideMessageDispatcher>(showSenderMessage);

  // One-shot join slow hint (3s), per join attempt
  const { arm: armJoinSlow, disarm: disarmJoinSlow, reset: resetJoinSlow } =
    useOneShotSlowHint({
      thresholdMs: 3000,
      displayMs: 6000,
      getMessage: () => {
        return { text: text.join.slow, showMessage: joinMessageRef.current };
      },
      visibilityGate: true,
    });

  // Join room method - directly use webrtcService
  const joinRoom = useCallback(
    async (isSenderSide: boolean, roomId: string) => {
      const showJoinMessage = isSenderSide
        ? showSenderMessage
        : showReceiverMessage;

      // UI: Joining feedback and slow network hint (one-shot)
      joinMessageRef.current = showJoinMessage;
      resetJoinSlow();

      try {
        // Immediate feedback on click
        showJoinMessage(text.join.inProgress, 6000);

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
              showJoinMessage(text.join.duplicate);
              disarmJoinSlow();
              return;
            }
            setSenderRoomSelection(roomId);
          } catch (error) {
            showJoinMessage(`${text.join.failure} (Create room error)`);
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
        showJoinMessage(text.join.success, 6000);

        if (isSenderSide) {
          if (actualRoomId !== shareRoomId) {
            setSenderRoomSelection(actualRoomId);
          }
        }
      } catch (error) {
        let errorMsg = text.join.failure;
        const rawMessage = error instanceof Error ? error.message : String(error);
        const isExpectedJoinFailure =
          rawMessage === "Room does not exist" ||
          rawMessage === "Join room timeout";

        if (!isExpectedJoinFailure) {
          console.error("[RoomManager] Failed to join room:", error);
        }

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
        showJoinMessage(errorMsg);
      }
    },
    [
      text,
      showSenderMessage,
      showReceiverMessage,
      activeTab,
      initShareRoomId,
      shareRoomId,
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
        showSenderMessage(text.messages.waiting);
      } else {
        await publishAndBroadcastSenderDraft();
      }
    } catch (error) {
      console.error("[RoomManager] Failed to generate share link:", error);
      showSenderMessage(text.messages.generateShareLinkError);
    }
  }, [
    text.messages.generateShareLinkError,
    text.messages.waiting,
    showSenderMessage,
    shareRoomId,
    sharePeerCount,
  ]);

  const handleLeaveReceiverRoom = useCallback(async () => {
    if (isAnyFileTransferring) {
      const confirmed = window.confirm(text.messages.confirmLeave);
      if (!confirmed) return;
    }

    const receiverSession = webrtcService.getSessionInfo("receiver");

    try {
      const message = isAnyFileTransferring
        ? text.messages.leaveSuccess
        : text.status.leftRoom;

      // Enter local shutdown first so in-flight requests are treated as intentional interrupts.
      await webrtcService.shutdownReceiver("leave_room");
      resetReceiverDomainState("leave_room");
      showReceiverMessage(message);

      // Notify the backend after local shutdown so peer-disconnect fanout still reaches sender.
      if (receiverSession.roomId && receiverSession.peerId) {
        const leftRoom = await leaveRoom(
          receiverSession.roomId,
          receiverSession.peerId
        );

        if (!leftRoom) {
          console.warn("[RoomManager] Receiver leave room API returned no success");
        }
      }
    } catch (error) {
      console.error("[RoomManager] Receiver failed to leave room:", error);
      showReceiverMessage(text.messages.leaveRoomError);
    }
  }, [
    isAnyFileTransferring,
    showReceiverMessage,
    text.messages.confirmLeave,
    text.messages.leaveRoomError,
    text.messages.leaveSuccess,
    text.status.leftRoom,
  ]);

  // Sender reset app state
  const resetSenderAppState = useCallback(async () => {
    try {
      // 1. Clean up WebRTC connection through explicit sender shutdown action.
      await webrtcService.shutdownSender("reset_app");

      // 2. Reset sender-owned store state
      resetSenderDomainState("reset_app");

      // 3. Fetch new room ID from backend
      const newRoomId = await fetchRoom();
      setSenderRoomSelection(newRoomId || "", { markAsInitial: true });
    } catch (error) {
      console.error("[RoomManager] Failed to reset sender state:", error);
      showSenderMessage(text.messages.resetSenderStateError);
    }
  }, [showSenderMessage, text.messages.resetSenderStateError]);

  const handleLeaveSenderRoom = useCallback(async () => {
    if (isAnyFileTransferring) {
      const confirmed = window.confirm(text.messages.confirmLeave);
      if (!confirmed) return;
    }

    try {
      // Call backend API to leave room
      const senderSession = webrtcService.getSessionInfo("sender");

      if (senderSession.roomId && senderSession.peerId) {
        await leaveRoom(
          senderSession.roomId,
          senderSession.peerId
        );
      }

      const message = isAnyFileTransferring
        ? text.messages.leaveSuccess
        : text.status.leftRoom;
      showSenderMessage(message);

      // Reset sender state and get new room ID (keeps files as per requirement)
      await resetSenderAppState();
    } catch (error) {
      console.error("[RoomManager] Sender failed to leave room:", error);
      showSenderMessage(text.messages.leaveRoomError);
    }
  }, [
    isAnyFileTransferring,
    showSenderMessage,
    resetSenderAppState,
    text.messages.confirmLeave,
    text.messages.leaveRoomError,
    text.messages.leaveSuccess,
    text.status.leftRoom,
  ]);

  // Room ID input processing
  const processRoomIdInput = useCallback(
    debounce(async (input: string) => {
      if (!input.trim()) return;

      try {
        const isValid = await checkRoom(input);
        if (isValid) {
          setSenderRoomSelection(input);
          showSenderMessage(text.roomCheck.available);
        } else {
          showSenderMessage(text.roomCheck.notAvailable);
        }
      } catch (error) {
        console.error("[RoomManager] Failed to validate room:", error);
        showSenderMessage(text.messages.validateRoomError);
      }
    }, 750),
    [
      showSenderMessage,
      text.messages.validateRoomError,
      text.roomCheck.available,
      text.roomCheck.notAvailable,
    ]
  );

  // Initialize sender room ID
  useEffect(() => {
    if (
      !initShareRoomId &&
      activeTab === "send"
    ) {
      const initNewRoom = async () => {
        try {
          const newRoomId = await fetchRoom();
          setSenderRoomSelection(newRoomId || "", { markAsInitial: true });
        } catch (err) {
          console.error("[RoomManager] Failed to fetch initial room:", err);
          showSenderMessage(text.messages.fetchRoomError);
        }
      };
      initNewRoom();
    }
  }, [
    text.messages.fetchRoomError,
    showSenderMessage,
    initShareRoomId,
    activeTab,
  ]);

  return {
    // State
    shareRoomId,
    initShareRoomId,
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
