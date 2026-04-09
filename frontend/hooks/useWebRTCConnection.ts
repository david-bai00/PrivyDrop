import { useEffect, useMemo } from "react";
import {
  publishAndBroadcastSenderDraft,
  ensureWebRTCStoreCoordinator,
} from "@/lib/app/WebRTCStoreCoordinator";
import { webrtcService } from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";

ensureWebRTCStoreCoordinator();

// Retain type definitions for compatibility
export type PeerProgressDetails = { progress: number; speed: number };
export type FileProgressPeers = { [peerId: string]: PeerProgressDetails };
export type ProgressState = { [fileId: string]: FileProgressPeers };

interface UseWebRTCConnectionProps {
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useWebRTCConnection({}: UseWebRTCConnectionProps) {
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
    broadcastDataToAllPeers: publishAndBroadcastSenderDraft,
    requestFile: webrtcService.requestFile.bind(webrtcService),
    requestFolder: webrtcService.requestFolder.bind(webrtcService),
    setReceiverDirectoryHandle:
      webrtcService.setReceiverDirectoryHandle.bind(webrtcService),
    getReceiverSaveType: webrtcService.getReceiverSaveType.bind(webrtcService),

    // Reset connection methods
    resetSenderConnection: () => webrtcService.shutdownSender("leave_room"),
    resetReceiverConnection: () => webrtcService.shutdownReceiver("leave_room"),
  };
}
