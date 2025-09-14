import { useEffect, useMemo } from "react";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import type { Messages } from "@/types/messages";

// Retain type definitions for compatibility
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
  // Retaining interface compatibility but these are no longer used
}: UseWebRTCConnectionProps) {
  // Get state from store
  const {
    sharePeerCount,
    retrievePeerCount,
    senderDisconnected,
    sendProgress,
    receiveProgress,
    setIsAnyFileTransferring,
  } = useFileTransferStore();

  // Calculate if any file is being transferred
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
    // State obtained from store
    sharePeerCount,
    retrievePeerCount,
    senderDisconnected,
    sendProgress,
    receiveProgress,

    // Methods exposed directly from service
    broadcastDataToAllPeers:
      webrtcService.broadcastDataToAllPeers.bind(webrtcService),
    requestFile: webrtcService.requestFile.bind(webrtcService),
    requestFolder: webrtcService.requestFolder.bind(webrtcService),
    setReceiverDirectoryHandle:
      webrtcService.setReceiverDirectoryHandle.bind(webrtcService),
    getReceiverSaveType: webrtcService.getReceiverSaveType.bind(webrtcService),

    // Reset connection methods
    resetSenderConnection: () => webrtcService.leaveRoom(true),
    resetReceiverConnection: () => webrtcService.leaveRoom(false),

    // For compatibility, retain these properties (but they are no longer needed)
    sender: webrtcService.sender,
    receiver: webrtcService.receiver,
  };
}
