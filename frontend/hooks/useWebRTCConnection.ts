import { useState, useEffect, useCallback } from "react";
import WebRTC_Initiator from "@/lib/webrtc_Initiator";
import WebRTC_Recipient from "@/lib/webrtc_Recipient";
import FileSender from "@/lib/fileSender";
import FileReceiver from "@/lib/fileReceiver";
import { config } from "@/app/config/environment"; // For API_URL
import { postLogInDebug } from "@/app/config/api"; // For debug logging
import type { CustomFile, fileMetadata, FileMeta } from "@/lib/types/file"; // Assuming FileMeta might be used by caller
import type { Messages } from "@/types/messages";

const developmentEnv = process.env.NEXT_PUBLIC_development === "true";

// Types for progress states
export type PeerProgressDetails = { progress: number; speed: number };
export type FileProgressPeers = { [peerId: string]: PeerProgressDetails };
export type ProgressState = { [fileId: string]: FileProgressPeers };

interface UseWebRTCConnectionProps {
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

  // Initialize WebRTC objects and their cleanup
  useEffect(() => {
    const senderConn = new WebRTC_Initiator(config.API_URL);
    const receiverConn = new WebRTC_Recipient(config.API_URL);
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
        if (developmentEnv)
          postLogInDebug(
            `Sending string content to ${peerId}: ${textContent.substring(
              0,
              100
            )}...`
          );
        await senderFileTransfer.sendString(textContent, peerId);
      }
      if (filesToSend.length > 0) {
        if (developmentEnv)
          postLogInDebug(
            `Sending file metadata to ${peerId} for ${filesToSend.length} files.`
          );
        senderFileTransfer.sendFileMeta(filesToSend, peerId);
      }
    },
    [senderFileTransfer]
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
      // The original `sender.onDataChannelOpen = sendStringAndMetas` is removed.
      // Sending is now explicitly triggered by `broadcastDataToAllPeers`.
      // `FileSender` should internally handle queueing if data channel is not open yet.
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
      receiverFileTransfer.onFileReceived = (file) => {
        const peerId = "testId";
        if (developmentEnv)
          console.log(`File received from peer ${peerId}: ${file.name}`);
        onFileReceived(file, peerId || "unknown_peer");
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
    // messages, putMessageInMs // Removed messages/putMessageInMs if only for console logs for now
  ]);

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

  const requestFile = useCallback(
    (fileId: string, peerId?: string) => {
      // Assuming FileReceiver methods can take optional peerId
      if (!receiverFileTransfer) return;
      if (developmentEnv)
        console.log(
          `Requesting file ${fileId} from peer ${peerId || "default"}`
        );
      receiverFileTransfer.requestFile(fileId, peerId);
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
      receiverFileTransfer.requestFolder(folderName, peerId);
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

  return {
    sender, // Exposed for useRoomManager (e.g., sender.isInRoom, sender.joinRoom)
    receiver, // Exposed for useRoomManager
    // Not exposing senderFileTransfer/receiverFileTransfer directly to encourage using specific methods
    sharePeerCount,
    retrievePeerCount,
    sendProgress,
    receiveProgress,
    broadcastDataToAllPeers,
    requestFile,
    requestFolder,
    setReceiverDirectoryHandle,
    getReceiverSaveType,
  };
}
