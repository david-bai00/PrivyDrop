import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchRoom, createRoom, checkRoom } from "@/app/config/api";
import { debounce } from "lodash";
import { format_peopleMsg } from "@/utils/formatMessage";
import type { Messages } from "@/types/messages";
import type WebRTC_Initiator from "@/lib/webrtc_Initiator"; // Adjust path as needed
import type WebRTC_Recipient from "@/lib/webrtc_Recipient"; // Adjust path as needed

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
  // retrieveRoomId is managed by the main component and passed where needed
  // shareContent and sendFiles are needed for `sendStringAndMetas` in handleShare,
  // but handleShare's primary role here is room-related (generating link).
  // `sendStringAndMetas` itself will be part of useWebRTCConnection or useFileTransfer.
  // For now, we might need to pass a simplified broadcast function or rethink.
  // Let's assume for now `broadcastData` is a function passed from the hook that will own `sendStringAndMetas`.
  broadcastDataToPeers: () => Promise<boolean>;
}

export function useRoomManager({
  messages,
  putMessageInMs,
  sender,
  receiver,
  activeTab,
  sharePeerCount,
  retrievePeerCount,
  broadcastDataToPeers,
}: UseRoomManagerProps) {
  const [shareRoomId, setShareRoomId] = useState("");
  const [initShareRoomId, setInitShareRoomId] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [shareRoomStatusText, setShareRoomStatusText] = useState("");
  const [retrieveRoomStatusText, setRetrieveRoomStatusText] = useState("");

  // Initialize shareRoomId on mount
  useEffect(() => {
    if (messages && putMessageInMs) {
      const initRoom = async () => {
        try {
          const newRoomId = await fetchRoom();
          setShareRoomId(newRoomId);
          setInitShareRoomId(newRoomId);
        } catch (err) {
          console.error("Error fetching room:", err);
          const errorMsg =
            messages.text?.ClipboardApp?.fetchRoom_err ||
            "Error fetching room ID.";
          putMessageInMs(errorMsg, true); // true for shareEnd
        }
      };
      initRoom();
    }
  }, [messages]);

  const debouncedCheckRoom = useMemo(
    () =>
      debounce(async (roomId: string): Promise<boolean | undefined> => {
        if (!messages) return undefined;
        try {
          const available = await checkRoom(roomId);
          return available;
        } catch (error) {
          console.error("Error checking room availability:", error);
          putMessageInMs(
            //messages.text.ClipboardApp.roomCheck.error_msg ||
            "Error checking room.",
            true
          );
          return undefined;
        }
      }, 50),
    [messages, putMessageInMs]
  );

  const checkAndSetShareRoomId = useCallback(
    async (roomId: string) => {
      if (!messages || !putMessageInMs) return;
      if (roomId.length === 0) {
        putMessageInMs(messages.text.ClipboardApp.roomCheck.empty_msg, true);
        return;
      }
      const available = await debouncedCheckRoom(roomId);
      if (available === true) {
        putMessageInMs(
          messages.text.ClipboardApp.roomCheck.available_msg,
          true
        );
        setShareRoomId(roomId);
      } else if (available === false) {
        putMessageInMs(
          messages.text.ClipboardApp.roomCheck.notAvailable_msg,
          true
        );
      }
      // If available is undefined, an error message was already shown by debouncedCheckRoom
    },
    [messages, putMessageInMs, debouncedCheckRoom]
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

      if (!currentRoomIdToJoin) {
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
          } catch (error) {
            console.error("Error creating room:", error);
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
        await peer.joinRoom(currentRoomIdToJoin, isSenderSide); // isInitiator flag
        putMessageInMs(
          messages.text.ClipboardApp.joinRoom.successMsg,
          isSenderSide,
          6000
        );
        if (isSenderSide) {
          const link = `${window.location.origin}${window.location.pathname}?roomId=${currentRoomIdToJoin}`;
          setShareLink(link);
        }
      } catch (error) {
        console.error("Failed to join room:", error);
        let errorMsgToShow = messages.text.ClipboardApp.joinRoom.failMsg;
        if (error instanceof Error) {
          if (error.message === "Room does not exist") {
            errorMsgToShow = messages.text.ClipboardApp.joinRoom.notExist;
          } else {
            errorMsgToShow += ` ${error.message}`;
          }
        } else {
          errorMsgToShow += " Unknown error";
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
      setShareLink,
    ]
  );

  const generateShareLinkAndBroadcast = useCallback(async () => {
    if (!sender || !messages || !putMessageInMs) return;

    if (sender.peerConnections.size === 0) {
      putMessageInMs(messages.text.ClipboardApp.waitting_tips, true);
    } else {
      await broadcastDataToPeers(); // Call the passed broadcast function
    }
    // Always generate/update the share link
    const link = `${window.location.origin}${window.location.pathname}?roomId=${shareRoomId}`;
    setShareLink(link);
  }, [sender, messages, putMessageInMs, shareRoomId, setShareLink]);

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
        if (activeTab === "send") {
          statusText = format_peopleMsg(
            messages.text.ClipboardApp.roomStatus.peopleMsg_template,
            currentPeerCount + 1
          );
        } else {
          // retrieve tab
          statusText = messages.text.ClipboardApp.roomStatus.connected_dis;
        }
      }
    }

    if (activeTab === "send") {
      setShareRoomStatusText(statusText);
    } else {
      setRetrieveRoomStatusText(statusText);
    }
  }, [
    activeTab,
    sharePeerCount,
    retrievePeerCount,
    sender,
    receiver,
    messages,
  ]);

  return {
    shareRoomId,
    initShareRoomId, // Mainly for internal logic or display if needed
    setShareRoomId, // Expose setter if direct manipulation from component is needed (e.g. after reading from clipboard)
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    checkAndSetShareRoomId, // Renamed from handleShareRoomCheck
    joinRoom, // Renamed from handleJoinRoom
    generateShareLinkAndBroadcast, // Renamed from handleShare
  };
}
