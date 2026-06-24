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
import { createLogger } from "@/lib/logger";
import {
  classifyJoinRoomFailureReason,
  runReceiverAutoJoinWithRetry,
  type JoinRoomFailureReason,
  type JoinRoomResult,
  type ReceiverAutoJoinSource,
} from "@/lib/app/receiverAutoJoinRetry";

const logger = createLogger({ scope: "Hooks.RoomManager" });

ensureWebRTCStoreCoordinator();

// Remove all WebRTC related props dependencies
interface UseRoomManagerProps {
  text: RoomManagerText;
}

interface JoinRoomOptions {
  source?: ReceiverAutoJoinSource;
  suppressProgressMessage?: boolean;
  suppressFailureMessage?: boolean;
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
  const receiverAutoJoinTokenRef = useRef(0);

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
    async (
      isSenderSide: boolean,
      roomId: string,
      options: JoinRoomOptions = {}
    ): Promise<JoinRoomResult> => {
      const showJoinMessage = isSenderSide
        ? showSenderMessage
        : showReceiverMessage;
      const {
        source = "manual",
        suppressProgressMessage = false,
        suppressFailureMessage = false,
      } = options;

      if (!isSenderSide && source === "manual") {
        receiverAutoJoinTokenRef.current += 1;
      }

      // UI: Joining feedback and slow network hint (one-shot)
      joinMessageRef.current = showJoinMessage;
      resetJoinSlow();

      try {
        // Immediate feedback on click
        if (!suppressProgressMessage) {
          showJoinMessage(text.join.inProgress, 6000);
        }

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
              return { ok: false, reason: "duplicate" };
            }
            setSenderRoomSelection(roomId);
          } catch (error) {
            showJoinMessage(`${text.join.failure} (Create room error)`);
            disarmJoinSlow();
            return { ok: false, reason: "create_room_error" };
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
        return { ok: true };
      } catch (error) {
        let errorMsg = text.join.failure;
        const rawMessage = error instanceof Error ? error.message : String(error);
        const failureReason: JoinRoomFailureReason =
          classifyJoinRoomFailureReason(rawMessage);
        const isExpectedJoinFailure =
          failureReason === "not_found" ||
          failureReason === "timeout" ||
          failureReason === "rate_limit";

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
        if (!suppressFailureMessage) {
          showJoinMessage(errorMsg);
        }
        return { ok: false, reason: failureReason };
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

  const autoJoinReceiverRoom = useCallback(
    async (
      source: Extract<ReceiverAutoJoinSource, "auto:url" | "auto:cached">,
      roomId: string
    ): Promise<JoinRoomResult> => {
      const normalizedRoomId = roomId.trim();

      if (!normalizedRoomId) {
        return { ok: false, reason: "other" };
      }

      const token = receiverAutoJoinTokenRef.current + 1;
      receiverAutoJoinTokenRef.current = token;

      return runReceiverAutoJoinWithRetry({
        source,
        roomId: normalizedRoomId,
        token,
        getSnapshot: () => {
          const uiState = useClipboardUiStore.getState();
          const transferState = useFileTransferStore.getState();

          return {
            activeTab: uiState.activeTab,
            isReceiverInRoom: transferState.isReceiverInRoom,
            retrieveRoomIdInput: uiState.retrieveRoomIdInput,
            token: receiverAutoJoinTokenRef.current,
          };
        },
        attemptJoin: (attempt, isFinalAttempt) =>
          joinRoom(false, normalizedRoomId, {
            source,
            suppressProgressMessage: attempt > 0,
            suppressFailureMessage: !isFinalAttempt,
          }),
      });
    },
    [joinRoom]
  );

  useEffect(() => {
    if (activeTab !== "retrieve" || isReceiverInRoom) {
      receiverAutoJoinTokenRef.current += 1;
    }
  }, [activeTab, isReceiverInRoom]);

  useEffect(
    () => () => {
      receiverAutoJoinTokenRef.current += 1;
    },
    []
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
    receiverAutoJoinTokenRef.current += 1;

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
          logger.warn({
            event: "receiver_leave_room_api_returned_no_success",
            context: {
              roomId: receiverSession.roomId,
              peerId: receiverSession.peerId,
            },
          });
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
    autoJoinReceiverRoom,
    generateShareLinkAndBroadcast,
    handleLeaveReceiverRoom,
    handleLeaveSenderRoom,
  };
}
