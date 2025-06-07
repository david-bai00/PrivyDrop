import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchRoom, createRoom, checkRoom } from "@/app/config/api";
import { debounce } from "lodash";
import type { Messages } from "@/types/messages";
import type WebRTC_Initiator from "@/lib/webrtc_Initiator";
import type WebRTC_Recipient from "@/lib/webrtc_Recipient";

function format_peopleMsg(
  template: string, 
  peerCount: number
) {
  return template.replace('{peerCount}', peerCount.toString());
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
  const [shareRoomId, setShareRoomId] = useState(""); // 代表已验证或初始获取的房间ID
  const [initShareRoomId, setInitShareRoomId] = useState(""); // 存储初始获取的房间ID，用于比较
  const [shareLink, setShareLink] = useState("");
  const [shareRoomStatusText, setShareRoomStatusText] = useState("");
  const [retrieveRoomStatusText, setRetrieveRoomStatusText] = useState("");

  // Initialize shareRoomId on mount
  useEffect(() => {
    if (
      messages &&
      putMessageInMs &&
      !initShareRoomId &&
      activeTab === "send"
    ) {
      // 确保只在发送端初次加载时获取
      const initNewRoom = async () => {
        try {
          const newRoomId = await fetchRoom();
          setShareRoomId(newRoomId);
          setInitShareRoomId(newRoomId);
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

  // 防抖函数，用于实际检查房间ID并更新状态
  const performDebouncedRoomCheck = useMemo(
    () =>
      debounce(async (roomIdToCheck: string) => {
        if (!messages || !putMessageInMs) return;

        if (!roomIdToCheck.trim()) {
          // 如果清空了输入，不进行检查，但可以清除提示或做其他处理
          // putMessageInMs(messages.text.ClipboardApp.roomCheck.empty_msg, true);
          // 考虑是否要重置 shareRoomId 为 initShareRoomId，如果希望清空输入时恢复默认
          // setShareRoomId(initShareRoomId);
          return;
        }

        try {
          const available = await checkRoom(roomIdToCheck);
          if (available) {
            setShareRoomId(roomIdToCheck); // 更新已验证的 shareRoomId
            putMessageInMs(
              messages.text.ClipboardApp.roomCheck.available_msg,
              true
            );
          } else {
            // 房间不可用，不更新 shareRoomId，它将保持上一个有效值或初始值
            // 用户输入框中的值由 SendTabPanel 的本地状态管理，不会因此回滚
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
      }, 750), // 防抖延迟增加到 750ms
    [messages, putMessageInMs, setShareRoomId]
  );

  // UI调用此函数来处理输入框ID的变化
  const processRoomIdInput = useCallback(
    (inputRoomId: string) => {
      if (!inputRoomId.trim() && messages && putMessageInMs) {
        // 如果用户清空了输入框
        putMessageInMs(messages.text.ClipboardApp.roomCheck.empty_msg, true);
        performDebouncedRoomCheck.cancel();
        // 并且，如果希望清空时，让 validated shareRoomId 回到初始状态：
        // setShareRoomId(initShareRoomId); // 这会让二维码等内容更新为初始ID
        return; // 不再继续执行防抖检查空字符串
      }
      performDebouncedRoomCheck(inputRoomId);
    },
    [performDebouncedRoomCheck, messages, putMessageInMs]
  ); // initShareRoomId从依赖中移除

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
            // 如果创建成功，WebRTC的joinRoom会使用这个ID，同时我们应该更新shareRoomId为这个新创建的ID
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
        // WebRTC joinRoom 使用用户提供的ID（对接收方）或已验证/新创建的ID（对发送方）
        // 对于发送方，如果上面 createRoom 成功并设置了 shareRoomId, peer.joinRoom 应使用它
        // 但如果 currentRoomIdToJoin 是 initShareRoomId，则直接用它
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
            // 如果是通过输入新ID并加入成功的，更新shareRoomId
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
    if (!sender || !messages || !putMessageInMs || !shareRoomId) return; // 确保 shareRoomId 有效

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
  ]);

  return {
    shareRoomId, // 这是已验证的或初始的房间ID
    initShareRoomId, // 暴露以便UI可以比较或用于重置逻辑
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    processRoomIdInput, // 新的处理输入函数
    joinRoom,
    generateShareLinkAndBroadcast,
  };
}
