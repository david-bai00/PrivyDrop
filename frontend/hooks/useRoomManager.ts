import { useEffect, useCallback, useMemo } from "react";
import { fetchRoom, createRoom, checkRoom, leaveRoom } from "@/app/config/api";
import { debounce } from "lodash";
import type { Messages } from "@/types/messages";
import type WebRTC_Initiator from "@/lib/webrtc_Initiator";
import type WebRTC_Recipient from "@/lib/webrtc_Recipient";
import { useFileTransferStore } from "@/stores/fileTransferStore";

function format_peopleMsg(template: string, peerCount: number) {
  return template.replace("{peerCount}", peerCount.toString());
}

interface UseRoomManagerProps {
  messages: Messages | null;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
  sender: WebRTC_Initiator | null;
  receiver: WebRTC_Recipient | null;
  broadcastDataToPeers: () => Promise<boolean>;
  resetSenderConnection: () => Promise<void>;
  resetReceiverConnection: () => Promise<void>;
}

export function useRoomManager({
  messages,
  putMessageInMs,
  sender,
  receiver,
  broadcastDataToPeers,
  resetSenderConnection,
  resetReceiverConnection,
}: UseRoomManagerProps) {
  // 从 store 中获取状态
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
    setShareRoomId,
    setInitShareRoomId,
    setShareLink,
    setShareRoomStatusText,
    setRetrieveRoomStatusText,
    setSharePeerCount,
    setRetrievePeerCount,
    resetReceiverState,
    resetSenderApp,
  } = useFileTransferStore();

  // Receiver leave room function
  const handleLeaveReceiverRoom = useCallback(async () => {
    console.log(`[RoomManager Debug] Receiver leaving room manually`);
    if (!receiver || !receiver.roomId || !receiver.peerId || !messages) return;
    try {
      await leaveRoom(receiver.roomId, receiver.peerId);
      putMessageInMs(messages.text.ClipboardApp.roomStatus.leftRoomMsg, false);
    } catch (error) {
      console.error("Error leaving room:", error);
      putMessageInMs("Failed to leave the room.", false);
    } finally {
      // Reset application state (不清空房间ID)
      resetReceiverState();
      // 清理WebRTC连接状态
      await resetReceiverConnection();
      console.log(
        `[RoomManager Debug] Receiver left room and WebRTC connection reset`
      );
    }
  }, [
    receiver,
    putMessageInMs,
    messages,
    resetReceiverState,
    resetReceiverConnection,
  ]);

  // Reset sender app state
  const resetSenderAppState = useCallback(async () => {
    try {
      // 1. Clean up WebRTC connections and reset peer count
      await resetSenderConnection();

      // 2. Clear share link and progress
      resetSenderApp();

      // 3. Get new room ID from backend
      const newRoomId = await fetchRoom();
      setShareRoomId(newRoomId || "");
      setInitShareRoomId(newRoomId || "");

      console.log(
        "Sender application state reset successfully, new room ID:",
        newRoomId
      );
    } catch (error) {
      console.error("Error during sender state reset:", error);
      putMessageInMs("Error resetting sender state.", true);
    }
  }, [
    resetSenderConnection,
    putMessageInMs,
    resetSenderApp,
    setShareRoomId,
    setInitShareRoomId,
  ]);

  // Sender leave room function
  const handleLeaveSenderRoom = useCallback(async () => {
    if (!sender || !sender.roomId || !sender.peerId || !messages) return;
    try {
      await leaveRoom(sender.roomId, sender.peerId);
      putMessageInMs(messages.text.ClipboardApp.roomStatus.leftRoomMsg, true);
    } catch (error) {
      console.error("Error leaving room:", error);
      putMessageInMs("Failed to leave the room.", true);
    } finally {
      // Reset sender state and get new room ID
      await resetSenderAppState();
    }
  }, [sender, putMessageInMs, resetSenderAppState, messages]);

  // Initialize shareRoomId on mount
  useEffect(() => {
    if (
      messages &&
      putMessageInMs &&
      !initShareRoomId &&
      activeTab === "send"
    ) {
      // Ensure this only runs on the sender's side on initial load
      const initNewRoom = async () => {
        try {
          const newRoomId = await fetchRoom();
          setShareRoomId(newRoomId || "");
          setInitShareRoomId(newRoomId || "");
        } catch (err) {
          console.error("Error fetching initial room:", err);
          const errorMsg =
            messages.text?.ClipboardApp?.fetchRoom_err ||
            "Error fetching room ID.";
          putMessageInMs(errorMsg, true);
        }
      };
      initNewRoom();
    }
  }, [
    messages,
    initShareRoomId,
    activeTab,
    setShareRoomId,
    setInitShareRoomId,
    putMessageInMs,
  ]);

  // Debounced function to actually check the room ID and update the state
  const performDebouncedRoomCheck = useMemo(
    () =>
      debounce(async (roomIdToCheck: string) => {
        if (!messages || !putMessageInMs) return;

        if (!roomIdToCheck.trim()) {
          return;
        }

        try {
          const available = await checkRoom(roomIdToCheck);
          if (available) {
            setShareRoomId(roomIdToCheck);
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
          console.error("Error checking room availability:", error);
          putMessageInMs("Error checking room.", true);
        }
      }, 750),
    [messages, putMessageInMs, setShareRoomId]
  );

  // UI calls this function to handle changes in the room ID input
  const processRoomIdInput = useCallback(
    (inputRoomId: string) => {
      if (!inputRoomId.trim() && messages && putMessageInMs) {
        putMessageInMs(messages.text.ClipboardApp.roomCheck.empty_msg, true);
        performDebouncedRoomCheck.cancel();
        return;
      }
      performDebouncedRoomCheck(inputRoomId);
    },
    [performDebouncedRoomCheck, messages, putMessageInMs]
  );

  const joinRoom = useCallback(
    async (isSenderSide: boolean, currentRoomIdToJoin: string) => {
      if (
        !messages ||
        !putMessageInMs ||
        (isSenderSide && !sender) ||
        (!isSenderSide && !receiver)
      ) {
        console.warn("joinRoom prerequisites not met");
        return;
      }

      const peer = isSenderSide ? sender : receiver;
      if (!peer) return;

      if (!currentRoomIdToJoin.trim()) {
        putMessageInMs(
          messages.text.ClipboardApp.joinRoom.EmptyMsg,
          isSenderSide
        );
        return;
      }

      // Create room if sender and not the initial room ID
      if (isSenderSide && activeTab === "send" && !peer.isInRoom) {
        if (currentRoomIdToJoin !== initShareRoomId) {
          try {
            const success = await createRoom(currentRoomIdToJoin);
            if (!success) {
              putMessageInMs(
                messages.text.ClipboardApp.joinRoom.DuplicateMsg,
                isSenderSide
              );
              return;
            }
            setShareRoomId(currentRoomIdToJoin);
          } catch (error) {
            putMessageInMs(
              messages.text.ClipboardApp.joinRoom.failMsg +
                ` (Create room error)`,
              isSenderSide
            );
            return;
          }
        }
      }

      try {
        const actualRoomIdForSenderJoin =
          isSenderSide && currentRoomIdToJoin !== initShareRoomId
            ? currentRoomIdToJoin
            : isSenderSide
            ? shareRoomId
            : currentRoomIdToJoin;

        console.log(
          `[RoomManager Debug] ${
            isSenderSide ? "Sender" : "Receiver"
          } joining room: ${actualRoomIdForSenderJoin}`
        );
        console.log(
          `[RoomManager Debug] Peer current state - isInRoom: ${peer.isInRoom}, roomId: ${peer.roomId}`
        );

        await peer.joinRoom(actualRoomIdForSenderJoin, isSenderSide);
        putMessageInMs(
          messages.text.ClipboardApp.joinRoom.successMsg,
          isSenderSide,
          6000
        );

        // 更新 Store 中的房间状态
        if (isSenderSide) {
          useFileTransferStore.getState().setIsSenderInRoom(true);
          console.log(
            `[RoomManager Debug] Sender joined room, setIsSenderInRoom(true)`
          );
          const link = `${window.location.origin}${window.location.pathname}?roomId=${actualRoomIdForSenderJoin}`;
          setShareLink(link);
          if (actualRoomIdForSenderJoin !== shareRoomId) {
            setShareRoomId(actualRoomIdForSenderJoin);
          }
        } else {
          useFileTransferStore.getState().setIsReceiverInRoom(true);
          console.log(
            `[RoomManager Debug] Receiver joined room, setIsReceiverInRoom(true)`
          );
        }
      } catch (error) {
        let errorMsgToShow = messages.text.ClipboardApp.joinRoom.failMsg;
        if (error instanceof Error) {
          errorMsgToShow =
            error.message === "Room does not exist"
              ? messages.text.ClipboardApp.joinRoom.notExist
              : `${messages.text.ClipboardApp.joinRoom.failMsg} ${error.message}`;
        }
        putMessageInMs(errorMsgToShow, isSenderSide);
      }
    },
    [
      messages,
      putMessageInMs,
      sender,
      receiver,
      activeTab,
      initShareRoomId,
      shareRoomId,
      setShareLink,
      setShareRoomId,
    ]
  );

  const generateShareLinkAndBroadcast = useCallback(async () => {
    if (!sender || !messages || !putMessageInMs || !shareRoomId) return;

    if (sharePeerCount === 0) {
      putMessageInMs(messages.text.ClipboardApp.waitting_tips, true);
    } else {
      await broadcastDataToPeers();
    }
    const link = `${window.location.origin}${window.location.pathname}?roomId=${shareRoomId}`;
    setShareLink(link);
  }, [
    sender,
    messages,
    putMessageInMs,
    shareRoomId,
    sharePeerCount,
    setShareLink,
    broadcastDataToPeers,
  ]);

  // useEffect for room status text
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

    // 调试日志
    console.log(
      `[RoomStatus Debug] activeTab: ${activeTab}, isInRoom: ${isInRoom}, peerCount: ${currentPeerCount}`
    );
    if (activeTab === "send") {
      console.log(
        `[RoomStatus Debug] Sender - isSenderInRoom: ${isSenderInRoom}, sharePeerCount: ${sharePeerCount}`
      );
    } else {
      console.log(
        `[RoomStatus Debug] Receiver - isReceiverInRoom: ${isReceiverInRoom}, retrievePeerCount: ${retrievePeerCount}`
      );
    }

    if (!isInRoom) {
      statusText =
        activeTab === "retrieve"
          ? messages.text.ClipboardApp.roomStatus.receiverEmptyMsg
          : messages.text.ClipboardApp.roomStatus.senderEmptyMsg;
      console.log(`[RoomStatus Debug] Not in room, status: ${statusText}`);
    } else if (currentPeerCount === 0) {
      statusText = messages.text.ClipboardApp.roomStatus.onlyOneMsg;
      console.log(
        `[RoomStatus Debug] In room, no peers, status: ${statusText}`
      );
    } else {
      statusText =
        activeTab === "send"
          ? format_peopleMsg(
              messages.text.ClipboardApp.roomStatus.peopleMsg_template,
              currentPeerCount + 1
            )
          : messages.text.ClipboardApp.roomStatus.connected_dis;
      console.log(
        `[RoomStatus Debug] In room, with peers, status: ${statusText}`
      );
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
    shareRoomId,
    initShareRoomId,
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    processRoomIdInput,
    joinRoom,
    generateShareLinkAndBroadcast,
    handleLeaveReceiverRoom,
    handleLeaveSenderRoom,
  };
}
