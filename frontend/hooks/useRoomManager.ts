import { useCallback, useEffect } from "react";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { fetchRoom, createRoom, checkRoom, leaveRoom } from "@/app/config/api";
import { debounce } from "lodash";
import type { Messages } from "@/types/messages";

function format_peopleMsg(template: string, peerCount: number) {
  return template.replace("{peerCount}", peerCount.toString());
}

// 移除所有 WebRTC 相关的 props 依赖
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
  // 从 store 获取状态
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
    resetReceiverState,
    resetSenderApp,
  } = useFileTransferStore();

  // 加入房间方法 - 直接使用 webrtcService
  const joinRoom = useCallback(
    async (isSenderSide: boolean, roomId: string) => {
      if (!messages) return;

      try {
        // 如果是发送方且房间ID不是初始ID，需要先创建房间
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

        // 确定实际要加入的房间ID
        const actualRoomId =
          isSenderSide && roomId !== initShareRoomId
            ? roomId
            : isSenderSide
            ? shareRoomId
            : roomId;

        // 直接调用 service 方法，无需依赖注入
        await webrtcService.joinRoom(actualRoomId, isSenderSide);

        putMessageInMs(
          messages.text.ClipboardApp.joinRoom.successMsg,
          isSenderSide,
          6000
        );

        // 更新分享链接
        if (isSenderSide) {
          const link = `${window.location.origin}${window.location.pathname}?roomId=${actualRoomId}`;
          setShareLink(link);
          if (actualRoomId !== shareRoomId) {
            setShareRoomId(actualRoomId);
          }
        }
      } catch (error) {
        console.error("[RoomManager] 加入房间失败:", error);
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

  // 生成分享链接并广播
  const generateShareLinkAndBroadcast = useCallback(async () => {
    if (!messages || !shareRoomId) return;

    try {
      if (sharePeerCount === 0) {
        putMessageInMs(messages.text.ClipboardApp.waitting_tips, true);
      } else {
        // 直接调用 service 的广播方法
        await webrtcService.broadcastDataToAllPeers();
      }

      // 更新分享链接
      const link = `${window.location.origin}${window.location.pathname}?roomId=${shareRoomId}`;
      setShareLink(link);
    } catch (error) {
      console.error("[RoomManager] 生成分享链接失败:", error);
      putMessageInMs("生成分享链接失败", true);
    }
  }, [messages, putMessageInMs, shareRoomId, sharePeerCount, setShareLink]);

  // 接收方离开房间
  const handleLeaveReceiverRoom = useCallback(async () => {
    if (!messages) return;

    try {
      // 调用后端 API 离开房间
      if (webrtcService.receiver.roomId && webrtcService.receiver.peerId) {
        await leaveRoom(
          webrtcService.receiver.roomId,
          webrtcService.receiver.peerId
        );
      }

      putMessageInMs(messages.text.ClipboardApp.roomStatus.leftRoomMsg, false);

      // 重置接收方状态
      resetReceiverState();

      // 清理 WebRTC 连接
      await webrtcService.leaveRoom(false);
    } catch (error) {
      console.error("[RoomManager] 接收方离开房间失败:", error);
      putMessageInMs("离开房间失败", true);
    }
  }, [messages, putMessageInMs, resetReceiverState]);

  // 发送方重置应用状态
  const resetSenderAppState = useCallback(async () => {
    try {
      // 1. 清理 WebRTC 连接
      await webrtcService.leaveRoom(true);

      // 2. 清除分享链接和进度
      resetSenderApp();

      // 3. 从后端获取新的房间ID
      const newRoomId = await fetchRoom();
      setShareRoomId(newRoomId || "");
      setInitShareRoomId(newRoomId || "");
    } catch (error) {
      console.error("[RoomManager] 重置发送方状态失败:", error);
      putMessageInMs("重置发送方状态失败", true);
    }
  }, [putMessageInMs, resetSenderApp, setShareRoomId, setInitShareRoomId]);

  // 发送方离开房间
  const handleLeaveSenderRoom = useCallback(async () => {
    if (!messages) return;

    try {
      // 调用后端 API 离开房间
      if (webrtcService.sender.roomId && webrtcService.sender.peerId) {
        await leaveRoom(
          webrtcService.sender.roomId,
          webrtcService.sender.peerId
        );
      }

      putMessageInMs(messages.text.ClipboardApp.roomStatus.leftRoomMsg, true);

      // 重置发送方状态并获取新房间ID
      await resetSenderAppState();
    } catch (error) {
      console.error("[RoomManager] 发送方离开房间失败:", error);
      putMessageInMs("离开房间失败", true);
    }
  }, [messages, putMessageInMs, resetSenderAppState]);

  // 房间ID输入处理
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
        console.error("[RoomManager] 验证房间失败:", error);
        putMessageInMs("验证房间失败", true);
      }
    }, 750),
    [messages, putMessageInMs, setShareRoomId]
  );

  // 初始化发送方房间ID
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
          console.error("[RoomManager] 获取初始房间失败:", err);
          const errorMsg =
            messages.text?.ClipboardApp?.fetchRoom_err || "获取房间ID失败";
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

  // 房间状态文本更新
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
    // 状态
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

    // 方法
    processRoomIdInput,
    joinRoom,
    generateShareLinkAndBroadcast,
    handleLeaveReceiverRoom,
    handleLeaveSenderRoom,
  };
}
