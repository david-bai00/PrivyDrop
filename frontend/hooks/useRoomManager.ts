import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchRoom, createRoom, checkRoom, leaveRoom } from "@/app/config/api";
import { debounce } from "lodash";
import type { Messages } from "@/types/messages";
import type WebRTC_Initiator from "@/lib/webrtc_Initiator";
import type WebRTC_Recipient from "@/lib/webrtc_Recipient";

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
  activeTab: "send" | "retrieve";
  sharePeerCount: number;
  retrievePeerCount: number;
  senderDisconnected: boolean;
  broadcastDataToPeers: () => Promise<boolean>;
  resetApp: () => void; // Add a reset function prop
}

export function useRoomManager({
  messages,
  putMessageInMs,
  sender,
  receiver,
  activeTab,
  sharePeerCount,
  retrievePeerCount,
  senderDisconnected,
  broadcastDataToPeers,
  resetApp,
}: UseRoomManagerProps) {
  const [shareRoomId, setShareRoomId] = useState(""); // Represents the validated or initially fetched room ID
  const [initShareRoomId, setInitShareRoomId] = useState(""); // Stores the initially fetched room ID for comparison
  const [shareLink, setShareLink] = useState("");
  const [shareRoomStatusText, setShareRoomStatusText] = useState("");
  const [retrieveRoomStatusText, setRetrieveRoomStatusText] = useState("");

  // Receiver leave room function (renamed and simplified)
  const handleLeaveReceiverRoom = useCallback(async () => {
    if (!receiver || !receiver.roomId || !receiver.peerId) return;
    try {
      await leaveRoom(receiver.roomId, receiver.peerId);
      putMessageInMs("You have left the room.", false);
    } catch (error) {
      console.error("Error leaving room:", error);
      putMessageInMs("Failed to leave the room.", false);
    } finally {
      // Reset application state
      resetApp();
    }
  }, [receiver, putMessageInMs, resetApp]);

  // Sender leave room function (new)
  const handleLeaveSenderRoom = useCallback(async () => {
    if (!sender || !sender.roomId || !sender.peerId) return;
    try {
      await leaveRoom(sender.roomId, sender.peerId);
      putMessageInMs("You have left the room.", true);
    } catch (error) {
      console.error("Error leaving room:", error);
      putMessageInMs("Failed to leave the room.", true);
    } finally {
      // Reset sender state and get new room ID
      await resetSenderApp();
    }
  }, [sender, putMessageInMs]);

  // Reset sender app state (preserve send content, get new room ID)
  const resetSenderApp = useCallback(async () => {
    try {
      // 1. Clean up WebRTC connections
      if (sender) {
        await sender.leaveRoomAndCleanup();
      }
      
      // 2. Clear share link
      setShareLink("");
      
      // 3. Get new room ID from backend
      const newRoomId = await fetchRoom();
      setShareRoomId(newRoomId || "");
      setInitShareRoomId(newRoomId || "");
      
      console.log("Sender application state reset successfully, new room ID:", newRoomId);
    } catch (error) {
      console.error("Error during sender state reset:", error);
      putMessageInMs("Error resetting sender state.", true);
    }
  }, [sender, putMessageInMs]);

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
  }, [messages, initShareRoomId]);

  // Debounced function to actually check the room ID and update the state
  const performDebouncedRoomCheck = useMemo(
    () =>
      debounce(async (roomIdToCheck: string) => {
        if (!messages || !putMessageInMs) return;

        if (!roomIdToCheck.trim()) {
          // If the input is cleared, don't perform a check, but you can clear the message or handle it otherwise
          // putMessageInMs(messages.text.ClipboardApp.roomCheck.empty_msg, true);
          // Consider resetting shareRoomId to initShareRoomId if you want to restore the default when input is cleared
          // setShareRoomId(initShareRoomId);
          return;
        }

        try {
          const available = await checkRoom(roomIdToCheck);
          if (available) {
            setShareRoomId(roomIdToCheck); // Update the validated shareRoomId
            putMessageInMs(
              messages.text.ClipboardApp.roomCheck.available_msg,
              true
            );
          } else {
            // Room is not available, do not update shareRoomId; it will retain the last valid or initial value
            // The value in the user's input box is managed by SendTabPanel's local state and will not roll back because of this
            putMessageInMs(
              messages.text.ClipboardApp.roomCheck.notAvailable_msg,
              true
            );
          }
        } catch (error) {
          console.error("Error checking room availability:", error);
          putMessageInMs(
            //messages.text.ClipboardApp.roomCheck.error_msg ||
            "Error checking room.",
            true
          );
        }
      }, 750), // Increased debounce delay to 750ms
    [messages, putMessageInMs, setShareRoomId]
  );

  // UI calls this function to handle changes in the room ID input
  const processRoomIdInput = useCallback(
    (inputRoomId: string) => {
      if (!inputRoomId.trim() && messages && putMessageInMs) {
        // If the user clears the input box
        putMessageInMs(messages.text.ClipboardApp.roomCheck.empty_msg, true);
        performDebouncedRoomCheck.cancel();
        // And if you want the validated shareRoomId to revert to the initial state upon clearing:
        // setShareRoomId(initShareRoomId); // This would update the QR code, etc., to the initial ID
        return; // Don't proceed with debounced check for an empty string
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
      if (!peer) return; // Should be caught by above, but for type safety

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
            // If creation is successful, WebRTC's joinRoom will use this ID, and we should update shareRoomId to this newly created ID
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
        // WebRTC joinRoom uses the ID provided by the user (for the receiver) or the validated/newly created ID (for the sender)
        // For the sender, if createRoom above was successful and set shareRoomId, peer.joinRoom should use it
        // But if currentRoomIdToJoin is initShareRoomId, use it directly
        const actualRoomIdForSenderJoin =
          isSenderSide && currentRoomIdToJoin !== initShareRoomId
            ? currentRoomIdToJoin
            : isSenderSide
            ? shareRoomId
            : currentRoomIdToJoin;

        await peer.joinRoom(actualRoomIdForSenderJoin, isSenderSide);
        putMessageInMs(
          messages.text.ClipboardApp.joinRoom.successMsg,
          isSenderSide,
          6000
        );

        if (isSenderSide) {
          const link = `${window.location.origin}${window.location.pathname}?roomId=${actualRoomIdForSenderJoin}`;
          setShareLink(link);
          if (actualRoomIdForSenderJoin !== shareRoomId) {
            // If joining was successful by entering a new ID, update shareRoomId
            setShareRoomId(actualRoomIdForSenderJoin);
          }
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
    if (!sender || !messages || !putMessageInMs || !shareRoomId) return; // Ensure shareRoomId is valid

    if (sender.peerConnections.size === 0) {
      putMessageInMs(messages.text.ClipboardApp.waitting_tips, true);
    } else {
      await broadcastDataToPeers();
    }
    const link = `${window.location.origin}${window.location.pathname}?roomId=${shareRoomId}`;
    setShareLink(link);
  }, [sender, messages, putMessageInMs, shareRoomId]);

  // useEffect for room status text
  useEffect(() => {
    if (
      !messages ||
      (activeTab === "send" && !sender) ||
      (activeTab === "retrieve" && !receiver)
    ) {
      if (activeTab === "send") setShareRoomStatusText("");
      else setRetrieveRoomStatusText("");
      return;
    }

    const currentPeer = activeTab === "send" ? sender : receiver;
    const currentPeerCount =
      activeTab === "send" ? sharePeerCount : retrievePeerCount;
    let statusText = "";

    if (currentPeer) {
      if (!currentPeer.isInRoom) {
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
    }
  }, [
    activeTab,
    sharePeerCount,
    retrievePeerCount,
    sender,
    receiver,
    messages,
    senderDisconnected,
  ]);

  

  return {
    shareRoomId, // This is the validated or initial room ID
    initShareRoomId, // Exposed for UI comparison or reset logic
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    processRoomIdInput, // New input processing function
    joinRoom,
    generateShareLinkAndBroadcast,
    handleLeaveReceiverRoom, // Renamed function
    handleLeaveSenderRoom, // New function
  };
}
