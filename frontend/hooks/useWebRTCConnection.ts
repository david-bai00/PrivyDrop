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
  // For user feedback and messages from the hook, if any (mostly for console for now)
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
  const [sender, setSender] = useState<WebRTC_Initiator | null>(null);
  const [receiver, setReceiver] = useState<WebRTC_Recipient | null>(null);
  const [senderFileTransfer, setSenderFileTransfer] =
    useState<FileSender | null>(null);
  const [receiverFileTransfer, setReceiverFileTransfer] =
    useState<FileReceiver | null>(null);

  // 从 store 中获取状态和数据
  const {
    shareContent,
    sendFiles,
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
      return Object.values(typedFileProgress).some((progress: unknown) => {
        const typedProgress = progress as PeerProgressDetails;
        return typedProgress.progress > 0 && typedProgress.progress < 1;
      });
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
  const broadcastDataToAllPeers = useCallback(async () => {
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
          sendStringAndMetasToPeer(peerId, shareContent, sendFiles)
        )
      );
      return true;
    } catch (error) {
      console.error("Error broadcasting data to peers:", error);
      return false;
    }
  }, [
    sender,
    senderFileTransfer,
    sendStringAndMetasToPeer,
    shareContent,
    sendFiles,
  ]);

  // Setup sender and receiver event handlers
  useEffect(() => {
    if (sender && senderFileTransfer) {
      sender.onConnectionStateChange = (state, peerId) => {
        if (developmentEnv)
          console.log(`Sender connection state with ${peerId}: ${state}`);
        // 更新连接状态
        useFileTransferStore.getState().setShareConnectionState(state as any);
        setSharePeerCount(sender.peerConnections.size);
        if (state === "connected") {
          senderFileTransfer.setProgressCallback(
            (fileId, progress: number, speed: number) => {
              useFileTransferStore
                .getState()
                .updateSendProgress(fileId, peerId, { progress, speed });
            },
            peerId
          );
        }
      };
      sender.onDataChannelOpen = () => {
        // 当数据通道打开时，标记发送方已加入房间
        useFileTransferStore.getState().setIsSenderInRoom(true);
        broadcastDataToAllPeers();
      };

      sender.onPeerDisconnected = (peerId) => {
        console.log(`[WebRTC Debug] Sender peer ${peerId} disconnected`);
        setTimeout(() => {
          const newPeerCount = sender.peerConnections.size;
          console.log(
            `[WebRTC Debug] Sender peer count after disconnect: ${newPeerCount}`
          );
          setSharePeerCount(newPeerCount);
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
        // 更新连接状态
        useFileTransferStore
          .getState()
          .setRetrieveConnectionState(state as any);
        setRetrievePeerCount(receiver.peerConnections.size);
        if (state === "connected") {
          receiverFileTransfer.setProgressCallback(
            (fileId, progress: number, speed: number) => {
              useFileTransferStore
                .getState()
                .updateReceiveProgress(fileId, peerId, { progress, speed });
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
        useFileTransferStore.getState().setRetrievedContent(data);
      };

      receiverFileTransfer.onFileMetaReceived = (meta) => {
        const peerId = "testId";
        if (developmentEnv)
          console.log(
            `File meta received from peer ${peerId} for: ${meta.name}`
          );
        const { type, ...metaWithoutType } = meta;
        const store = useFileTransferStore.getState();
        // Filter out existing file with same ID and add the new one
        const DPrev = store.retrievedFileMetas.filter(
          (existingFile) => existingFile.fileId !== metaWithoutType.fileId
        );
        store.setRetrievedFileMetas([...DPrev, metaWithoutType]);
      };

      receiverFileTransfer.onFileReceived = async (file) => {
        const peerId = "testId"; // This should be dynamic in a multi-peer scenario
        if (developmentEnv)
          console.log(`File received from peer ${peerId}: ${file.name}`);
        // Directly call the store action
        useFileTransferStore.getState().addRetrievedFile(file);
      };

      receiver.onPeerDisconnected = (peerId) => {
        console.log(`[WebRTC Debug] Receiver peer ${peerId} disconnected`);
        setSenderDisconnected(true);
        setRetrievePeerCount(0);
        // 注意：接收端断开连接时应该保持在房间状态，除非主动离开
        console.log(
          `[WebRTC Debug] Receiver peer disconnected, but staying in room`
        );
      };

      receiver.onConnectionEstablished = (peerId) => {
        console.log(
          `[WebRTC Debug] Receiver connection established with ${peerId}`
        );
        setSenderDisconnected(false);
        useFileTransferStore.getState().setIsReceiverInRoom(true);
        console.log(
          `[WebRTC Debug] Receiver setIsReceiverInRoom(true) after connection established`
        );
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
    putMessageInMs,
    broadcastDataToAllPeers,
    isAnyFileTransferring,
    setSharePeerCount,
    setRetrievePeerCount,
    setSenderDisconnected,
  ]);

  // Calculate isContentPresent from store data
  const isContentPresent = useMemo(() => {
    return shareContent !== "" || sendFiles.length > 0;
  }, [shareContent, sendFiles]);

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
      useFileTransferStore.getState().setIsReceiverInRoom(false);
      await receiver.leaveRoomAndCleanup();
    }
  }, [receiver, setSenderDisconnected, setRetrievePeerCount]);

  // Reset function for sender connection (for leave room functionality)
  const resetSenderConnection = useCallback(async () => {
    if (sender) {
      await sender.leaveRoomAndCleanup();
      setSharePeerCount(0);
      useFileTransferStore.getState().setIsSenderInRoom(false);
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
