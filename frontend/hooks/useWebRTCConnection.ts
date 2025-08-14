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
import type { CustomFile, fileMetadata, FileMeta } from "@/types/webrtc"; // Assuming FileMeta might be used by caller
import type { Messages } from "@/types/messages";

const developmentEnv = process.env.NEXT_PUBLIC_development === "true";

// Types for progress states
export type PeerProgressDetails = { progress: number; speed: number };
export type FileProgressPeers = { [peerId: string]: PeerProgressDetails };
export type ProgressState = { [fileId: string]: FileProgressPeers };

interface UseWebRTCConnectionProps {
  shareContent: string;
  sendFiles: CustomFile[];
  isContentPresent: boolean; // To know if there is any content (text or files)
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

  const [sharePeerCount, setSharePeerCount] = useState(0);
  const [retrievePeerCount, setRetrievePeerCount] = useState(0);

  const [sendProgress, setSendProgress] = useState<ProgressState>({});
  const [receiveProgress, setReceiveProgress] = useState<ProgressState>({});
  const [senderDisconnected, setSenderDisconnected] = useState(false);

  // Calculate isAnyFileTransferring internally based on progress states
  const isAnyFileTransferring = useMemo(() => {
    const allProgress = [
      ...Object.values(sendProgress),
      ...Object.values(receiveProgress),
    ];
    return allProgress.some((fileProgress) =>
      Object.values(fileProgress).some(
        (progress) => progress.progress > 0 && progress.progress < 1
      )
    );
  }, [sendProgress, receiveProgress]);

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
        // TODO: Use putMessageInMs for critical errors visible to user?
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
        // The caller (useRoomManager) will handle user message like "waiting for peers"
        if (developmentEnv)
          console.warn(
            "No sender peers to broadcast to, or sender not initialized."
          );
        return false; // Indicate failure or no action
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
        return true; // Indicate success
      } catch (error) {
        console.error("Error broadcasting data to peers:", error);
        // Optionally use putMessageInMs here for a generic broadcast error
        return false; // Indicate failure
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
          senderFileTransfer.setProgressCallback((fileId, progress, speed) => {
            setSendProgress((prev) => ({
              ...prev,
              [fileId]: { ...prev[fileId], [peerId]: { progress, speed } },
            }));
          }, peerId);
          // putMessageInMs(`Connected to a new peer (sender side). Total: ${sender.peerConnections.size}`, true);
        }
        // Add more detailed user messages based on state if needed via putMessageInMs
      };
      sender.onDataChannelOpen = () =>
        broadcastDataToAllPeers(shareContent, sendFiles);

      sender.onError = (error) => {
        console.error("Sender Error:", error.message, error.context);
        // Optionally, use putMessageInMs to show a user-friendly error
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
            (fileId, progress, speed) => {
              setReceiveProgress((prev) => ({
                ...prev,
                [fileId]: { ...prev[fileId], [peerId]: { progress, speed } },
              }));
            }
          );
          // Example: putMessageInMs(`Connected to a new peer (receiver side). Total: ${receiver.peerConnections.size}`, false);
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
        // On the receiver side, any peer is a sender.
        setSenderDisconnected(true);
        // Set peer count to 0 since the peer has disconnected
        // Note: receiver.peerConnections.size might still be > 0 at this point
        // because cleanupExistingConnection hasn't been called yet
        setRetrievePeerCount(0);
      };

      receiver.onConnectionEstablished = (peerId) => {
        if (developmentEnv)
          console.log(`Receiver connection established with ${peerId}.`);
        // If a connection is re-established, assume sender is back.
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
  ]);

  // Effect to handle graceful shutdown on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isContentPresent || isAnyFileTransferring) {
        if (isAnyFileTransferring) {
          receiverFileTransfer?.gracefulShutdown();
        }
        // Show the browser's confirmation dialog
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
      // Assuming FileReceiver methods can take optional peerId
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
      // First reset all UI states to ensure consistent state
      setSenderDisconnected(false);
      setRetrievePeerCount(0);
      // Then cleanup the WebRTC connection
      await receiver.leaveRoomAndCleanup();
    }
  }, [receiver]);

  // Reset function for sender connection (for leave room functionality)
  const resetSenderConnection = useCallback(async () => {
    if (sender) {
      // First reset UI state to ensure consistent state
      setSharePeerCount(0);
      // Then cleanup the WebRTC connection
      await sender.leaveRoomAndCleanup();
    }
  }, [sender]);

  return {
    sender, // Exposed for useRoomManager (e.g., sender.isInRoom, sender.joinRoom)
    receiver, // Exposed for useRoomManager
    // Not exposing senderFileTransfer/receiverFileTransfer directly to encourage using specific methods
    sharePeerCount,
    retrievePeerCount,
    sendProgress,
    receiveProgress,
    isAnyFileTransferring, // Export the calculated state
    broadcastDataToAllPeers,
    requestFile,
    requestFolder,
    setReceiverDirectoryHandle,
    getReceiverSaveType,
    senderDisconnected,
    resetReceiverConnection, // Export the new reset function
    resetSenderConnection, // Export the new sender reset function
  };
}
