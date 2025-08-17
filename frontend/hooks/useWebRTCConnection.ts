import { useEffect, useMemo } from "react";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import type { Messages } from "@/types/messages";

// 保留类型定义以保持兼容性
export type PeerProgressDetails = { progress: number; speed: number };
export type FileProgressPeers = { [peerId: string]: PeerProgressDetails };
export type ProgressState = { [fileId: string]: FileProgressPeers };

interface UseWebRTCConnectionProps {
  messages: Messages | null;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useWebRTCConnection({
  messages,
  putMessageInMs,
}: UseWebRTCConnectionProps) {
  // 从 store 获取状态
  const {
    sharePeerCount,
    retrievePeerCount,
    senderDisconnected,
    sendProgress,
    receiveProgress,
    setIsAnyFileTransferring,
  } = useFileTransferStore();

  // 计算是否有文件正在传输
  const isAnyFileTransferring = useMemo(() => {
    const allProgress = [
      ...Object.values(sendProgress),
      ...Object.values(receiveProgress),
    ];
    return allProgress.some((fileProgress: any) => {
      return Object.values(fileProgress).some((progress: any) => {
        return progress.progress > 0 && progress.progress < 1;
      });
    });
  }, [sendProgress, receiveProgress]);

  useEffect(() => {
    setIsAnyFileTransferring(isAnyFileTransferring);
  }, [isAnyFileTransferring, setIsAnyFileTransferring]);

  return {
    // 状态从 store 获取
    sharePeerCount,
    retrievePeerCount,
    senderDisconnected,
    sendProgress,
    receiveProgress,

    // 方法直接从 service 暴露
    broadcastDataToAllPeers:
      webrtcService.broadcastDataToAllPeers.bind(webrtcService),
    requestFile: webrtcService.requestFile.bind(webrtcService),
    requestFolder: webrtcService.requestFolder.bind(webrtcService),
    setReceiverDirectoryHandle:
      webrtcService.setReceiverDirectoryHandle.bind(webrtcService),
    getReceiverSaveType: webrtcService.getReceiverSaveType.bind(webrtcService),
    manualSafeSave: webrtcService.manualSafeSave.bind(webrtcService),

    // 重置连接方法
    resetSenderConnection: () => webrtcService.leaveRoom(true),
    resetReceiverConnection: () => webrtcService.leaveRoom(false),

    // 为了兼容性，保留这些属性（但实际上不再需要）
    sender: webrtcService.sender,
    receiver: webrtcService.receiver,
  };
}
