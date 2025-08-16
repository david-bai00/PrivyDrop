import { useState, useEffect, useCallback, useMemo } from "react";
import WebRTC_Initiator from "@/lib/webrtc_Initiator";
import WebRTC_Recipient from "@/lib/webrtc_Recipient";
import FileSender from "@/lib/fileSender";
import FileReceiver from "@/lib/fileReceiver";
import {
  config,
  getIceServers,
  getSocketOptions,
} from "@/app/config/environment";
import type { CustomFile, fileMetadata, FileMeta } from "@/types/webrtc";
import type { Messages } from "@/types/messages";
import { useFileTransferStore } from "@/stores/fileTransferStore";

const developmentEnv = process.env.NEXT_PUBLIC_development === "true";

// Types for progress states
export type PeerProgressDetails = { progress: number; speed: number };
export type FileProgressPeers = { [peerId: string]: PeerProgressDetails };
export type ProgressState = { [fileId: string]: FileProgressPeers };

interface UseWebRTCConnectionProps {
  shareContent: string;
  sendFiles: CustomFile[];
  isContentPresent: boolean;
  // Callbacks for data received from peers
  onStringReceived: (data: string, peerId: string) => void;
  onFileMetaReceived: (meta: fileMetadata, peerId: string) => void;
  onFileReceived: (file: CustomFile, peerId: string) => void;

  // For user feedback and messages from the hook, if any (mostly for console for now)
  messages: Messages | null;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useWebRTCConnection({
  shareContent,
  sendFiles,
  isContentPresent,
  onStringReceived,
  onFileMetaReceived,
  onFileReceived,
  messages,
  putMessageInMs,
}: UseWebRTCConnectionProps) {
  const [sender, setSender] = useState<WebRTC_Initiator | null>(null);
  const [receiver, setReceiver] = useState<WebRTC_Recipient | null>(null);
  const [senderFileTransfer, setSenderFileTransfer] =
    useState<FileSender | null>(null);
  const [receiverFileTransfer, setReceiverFileTransfer] =
    useState<FileReceiver | null>(null);

  // 从 store 中获取状态
  const {
    sharePeerCount,
    retrievePeerCount,
    sendProgress,
    receiveProgress,
    senderDisconnected,
    setSharePeerCount,
    setRetrievePeerCount,
    setSendProgress,
    setReceiveProgress,
    setSenderDisconnected,
    setIsAnyFileTransferring,
  } = useFileTransferStore();

  // Calculate isAnyFileTransferring internally based on progress states
  const isAnyFileTransferring = useMemo(() => {
    const allProgress = [
      ...Object.values(sendProgress),
      ...Object.values(receiveProgress),
    ];
    return allProgress.some((fileProgress: unknown) => {
      const typedFileProgress = fileProgress as FileProgressPeers;
      return Object.values(typedFileProgress).some(
        (progress: unknown) => {
          const typedProgress = progress as PeerProgressDetails;
          return typedProgress.progress > 0 && typedProgress.progress < 1;
        }
      );
    });
  }, [sendProgress, receiveProgress]);

  // 更新 store 中的 isAnyFileTransferring 状态
  useEffect(() => {
    setIsAnyFileTransferring(isAnyFileTransferring);
  }, [isAnyFileTransferring, setIsAnyFileTransferring]);

  // Initialize WebRTC objects and their cleanup
  useEffect(() => {
    const webRTCConfig = {
      iceServers: getIceServers(),
      socketOptions: getSocketOptions() || {},
      signalingServer: config.API_URL,
    };
    const senderConn = new WebRTC_Initiator(webRTCConfig);
    const receiverConn = new WebRTC_Recipient(webRTCConfig);
    setSender(senderConn);
    setReceiver(receiverConn);

    const senderFT = new FileSender(senderConn);
    const receiverFT = new FileReceiver(receiverConn);
    setSenderFileTransfer(senderFT);
    setReceiverFileTransfer(receiverFT);
    if (developmentEnv)
      console.log("WebRTC connection and file transfer instances created");

    return () => {
      if (developmentEnv) console.log("Cleaning up WebRTC instances");
      senderConn.cleanUpBeforeExit();
      receiverConn.cleanUpBeforeExit();
    };
  }, []);

  // Internal function to send text and file metadata to a specific peer
  const sendStringAndMetasToPeer = useCallback(
    async (peerId: string, textContent: string, filesToSend: CustomFile[]) => {
      if (!senderFileTransfer) {
        console.error(
          "SenderFileTransfer not initialized for sendStringAndMetasToPeer"
        );
        return;
      }
      if (textContent) {
        await senderFileTransfer.sendString(textContent, peerId);
      }
      if (filesToSend.length > 0) {
        senderFileTransfer.sendFileMeta(filesToSend, peerId);
      }
    },
    [senderFileTransfer]
  );

  // Exposed function to broadcast data to all connected sender peers
  const broadcastDataToAllPeers = useCallback(
    async (textContent: string, filesToSend: CustomFile[]) => {
      if (!sender || sender.peerConnections.size === 0) {
        if (developmentEnv)
          console.warn(
            "No sender peers to broadcast to, or sender not initialized."
          );
        return false;
      }
      if (!senderFileTransfer) {
        console.error("senderFileTransfer is not initialized for broadcast.");
        return false;
      }
      const peerIds = Array.from(sender.peerConnections.keys());
      if (developmentEnv)
        console.log(`Broadcasting to peers: ${peerIds.join(", ")}`);
      try {
        await Promise.all(
          peerIds.map((peerId) =>
            sendStringAndMetasToPeer(peerId, textContent, filesToSend)
          )
        );
        return true;
      } catch (error) {
        console.error("Error broadcasting data to peers:", error);
        return false;
      }
    },
    [sender, senderFileTransfer, sendStringAndMetasToPeer]
  );

  // Setup sender and receiver event handlers
  useEffect(() => {
    if (sender && senderFileTransfer) {
      sender.onConnectionStateChange = (state, peerId) => {
        if (developmentEnv)
          console.log(`Sender connection state with ${peerId}: ${state}`);
        setSharePeerCount(sender.peerConnections.size);
        if (state === "connected") {
          senderFileTransfer.setProgressCallback((fileId, progress: number, speed: number) => {
            setSendProgress((prev: ProgressState) => ({
              ...prev,
              [fileId]: { ...prev[fileId], [peerId]: { progress, speed } },
            }));
          }, peerId);
        }
      };
      sender.onDataChannelOpen = () =>
        broadcastDataToAllPeers(shareContent, sendFiles);

      sender.onPeerDisconnected = (peerId) => {
        setTimeout(() => {
          setSharePeerCount(sender.peerConnections.size);
        }, 0);
      };

      sender.onError = (error) => {
        console.error("Sender Error:", error.message, error.context);
        putMessageInMs(`Connection error: ${error.message}`, true);
      };
    }

    if (receiver && receiverFileTransfer) {
      receiver.onConnectionStateChange = (state, peerId) => {
        if (developmentEnv)
          console.log(`Receiver connection state with ${peerId}: ${state}`);
        setRetrievePeerCount(receiver.peerConnections.size);
        if (state === "connected") {
          receiverFileTransfer.setProgressCallback(
            (fileId, progress: number, speed: number) => {
              setReceiveProgress((prev: ProgressState) => ({
                ...prev,
                [fileId]: { ...prev[fileId], [peerId]: { progress, speed } },
              }));
            }
          );
        } else if (state === "failed" || state === "disconnected") {
          if (isAnyFileTransferring) {
            receiverFileTransfer.gracefulShutdown();
          }
        }
      };

      receiverFileTransfer.onStringReceived = (data) => {
        const peerId = "testId";
        if (developmentEnv) console.log(`String received from peer ${peerId}`);
        onStringReceived(data, peerId || "unknown_peer");
      };
      receiverFileTransfer.onFileMetaReceived = (meta) => {
        const peerId = "testId";
        if (developmentEnv)
          console.log(
            `File meta received from peer ${peerId} for: ${meta.name}`
          );
        onFileMetaReceived(meta, peerId || "unknown_peer");
      };
      receiverFileTransfer.onFileReceived = async (file) => {
        const peerId = "testId";
        if (developmentEnv)
          console.log(`File received from peer ${peerId}: ${file.name}`);
        onFileReceived(file, peerId || "unknown_peer");
      };

      receiver.onPeerDisconnected = (peerId) => {
        if (developmentEnv)
          console.log(`Receiver peer ${peerId} disconnected.`);
        setSenderDisconnected(true);
        setRetrievePeerCount(0);
      };

      receiver.onConnectionEstablished = (peerId) => {
        if (developmentEnv)
          console.log(`Receiver connection established with ${peerId}.`);
        setSenderDisconnected(false);
      };

      receiver.onError = (error) => {
        console.error("Receiver Error:", error.message, error.context);
        putMessageInMs(`Connection error: ${error.message}`, false);
      };
    }
  }, [
    sender,
    senderFileTransfer,
    receiver,
    receiverFileTransfer,
    onStringReceived,
    onFileMetaReceived,
    onFileReceived,
    putMessageInMs,
    broadcastDataToAllPeers,
    shareContent,
    sendFiles,
    isAnyFileTransferring,
    setSharePeerCount,
    setRetrievePeerCount,
    setSendProgress,
    setReceiveProgress,
    setSenderDisconnected,
  ]);

  // Effect to handle graceful shutdown on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isContentPresent || isAnyFileTransferring) {
        if (isAnyFileTransferring) {
          receiverFileTransfer?.gracefulShutdown();
        }
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isContentPresent, isAnyFileTransferring, receiverFileTransfer]);

  const requestFile = useCallback(
    (fileId: string, peerId?: string) => {
      if (!receiverFileTransfer) return;
      if (developmentEnv)
        console.log(
          `Requesting file ${fileId} from peer ${peerId || "default"}`
        );
      receiverFileTransfer.requestFile(fileId);
    },
    [receiverFileTransfer]
  );

  const requestFolder = useCallback(
    (folderName: string, peerId?: string) => {
      if (!receiverFileTransfer) return;
      if (developmentEnv)
        console.log(
          `Requesting folder ${folderName} from peer ${peerId || "default"}`
        );
      receiverFileTransfer.requestFolder(folderName);
    },
    [receiverFileTransfer]
  );

  const setReceiverDirectoryHandle = useCallback(
    async (directoryHandle: FileSystemDirectoryHandle): Promise<void> => {
      if (!receiverFileTransfer) return;
      if (developmentEnv)
        console.log("Setting receiver save directory handle.");
      return receiverFileTransfer.setSaveDirectory(directoryHandle);
    },
    [receiverFileTransfer]
  );

  const getReceiverSaveType = useCallback(():
    | { [fileId: string]: boolean }
    | undefined => {
    return receiverFileTransfer?.saveType;
  }, [receiverFileTransfer]);

  // Reset function for receiver connection (for leave room functionality)
  const resetReceiverConnection = useCallback(async () => {
    if (receiver) {
      setSenderDisconnected(false);
      setRetrievePeerCount(0);
      await receiver.leaveRoomAndCleanup();
    }
  }, [receiver, setSenderDisconnected, setRetrievePeerCount]);

  // Reset function for sender connection (for leave room functionality)
  const resetSenderConnection = useCallback(async () => {
    if (sender) {
      await sender.leaveRoomAndCleanup();
      setSharePeerCount(0);
    }
  }, [sender, setSharePeerCount]);

  // Manual safe save function
  const manualSafeSave = useCallback(() => {
    if (receiverFileTransfer) {
      receiverFileTransfer.gracefulShutdown();
      if (putMessageInMs && messages) {
        putMessageInMs(
          messages.text.FileListDisplay.safeSaveSuccessMsg,
          false,
          3000
        );
      }
    }
  }, [receiverFileTransfer, putMessageInMs, messages]);

  return {
    sender,
    receiver,
    sharePeerCount,
    retrievePeerCount,
    sendProgress,
    receiveProgress,
    isAnyFileTransferring,
    broadcastDataToAllPeers,
    requestFile,
    requestFolder,
    setReceiverDirectoryHandle,
    getReceiverSaveType,
    senderDisconnected,
    resetReceiverConnection,
    resetSenderConnection,
    manualSafeSave,
  };
}