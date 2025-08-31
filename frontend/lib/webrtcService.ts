import WebRTC_Initiator from "@/lib/webrtc_Initiator";
import WebRTC_Recipient from "@/lib/webrtc_Recipient";
import FileSender from "@/lib/fileSender";
import FileReceiver from "@/lib/fileReceiver";
import {
  getIceServers,
  getSocketOptions,
  config,
} from "@/app/config/environment";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import type { CustomFile } from "@/types/webrtc";

class WebRTCService {
  public sender: WebRTC_Initiator;
  public receiver: WebRTC_Recipient;
  public fileSender: FileSender;
  public fileReceiver: FileReceiver;

  private static instance: WebRTCService;

  private constructor() {
    const webRTCConfig = {
      iceServers: getIceServers(),
      socketOptions: getSocketOptions() || {},
      signalingServer: config.API_URL,
    };

    this.sender = new WebRTC_Initiator(webRTCConfig);
    this.receiver = new WebRTC_Recipient(webRTCConfig);
    this.fileSender = new FileSender(this.sender);
    this.fileReceiver = new FileReceiver(this.receiver);

    this.initializeEventHandlers();
  }

  public static getInstance(): WebRTCService {
    if (!WebRTCService.instance) {
      WebRTCService.instance = new WebRTCService();
    }
    return WebRTCService.instance;
  }

  private initializeEventHandlers(): void {
    // Sender event handling
    this.sender.onConnectionStateChange = (state, peerId) => {
      useFileTransferStore.getState().setShareConnectionState(state as any);
      useFileTransferStore
        .getState()
        .setSharePeerCount(this.sender.peerConnections.size);

      if (state === "connected") {
        this.fileSender.setProgressCallback((fileId, progress, speed) => {
          useFileTransferStore
            .getState()
            .updateSendProgress(fileId, peerId, { progress, speed });
        }, peerId);
      }
    };

    this.sender.onDataChannelOpen = (peerId) => {
      useFileTransferStore.getState().setIsSenderInRoom(true);
      // Automatically broadcast current content
      this.broadcastDataToAllPeers();
    };

    this.sender.onPeerDisconnected = (peerId) => {
      setTimeout(() => {
        useFileTransferStore
          .getState()
          .setSharePeerCount(this.sender.peerConnections.size);
      }, 0);
    };

    this.sender.onError = (error) => {
      console.error("[WebRTC Service] Sender error:", error.message);
    };

    // Receiver event handling
    this.receiver.onConnectionStateChange = (state, peerId) => {
      useFileTransferStore.getState().setRetrieveConnectionState(state as any);
      useFileTransferStore
        .getState()
        .setRetrievePeerCount(this.receiver.peerConnections.size);

      if (state === "connected") {
        this.fileReceiver.setProgressCallback((fileId, progress, speed) => {
          useFileTransferStore
            .getState()
            .updateReceiveProgress(fileId, peerId, { progress, speed });
        });
      } else if (state === "failed" || state === "disconnected") {
        const { isAnyFileTransferring } = useFileTransferStore.getState();
        if (isAnyFileTransferring) {
          this.fileReceiver.gracefulShutdown();
        }
      }
    };

    this.receiver.onConnectionEstablished = (peerId) => {
      const store = useFileTransferStore.getState();
      useFileTransferStore.getState().setSenderDisconnected(false);
      useFileTransferStore.getState().setIsReceiverInRoom(true);
    };

    this.receiver.onPeerDisconnected = (peerId) => {
      const store = useFileTransferStore.getState();

      useFileTransferStore.getState().setSenderDisconnected(true);
      useFileTransferStore.getState().setRetrievePeerCount(0);
    };

    this.fileReceiver.onStringReceived = (data) => {
      useFileTransferStore.getState().setRetrievedContent(data);
    };

    this.fileReceiver.onFileMetaReceived = (meta) => {
      const { type, ...metaWithoutType } = meta;
      const store = useFileTransferStore.getState();
      const filteredMetas = store.retrievedFileMetas.filter(
        (existingFile) => existingFile.fileId !== metaWithoutType.fileId
      );
      store.setRetrievedFileMetas([...filteredMetas, metaWithoutType]);
    };

    this.fileReceiver.onFileReceived = async (file) => {
      // 🔧 Enhanced fix: Ensure Store state updates are fully synchronized with multiple verifications
      const store = useFileTransferStore.getState();

      // Check if file already exists to avoid duplicates
      const existingFile = store.retrievedFiles.find(
        (f) => f.name === file.name && f.size === file.size
      );

      if (!existingFile) {
        store.addRetrievedFile(file);
      }

      // 🔧 Additional ensure: Immediately verify if state update was successful with retry mechanism
      let verificationAttempts = 0;
      const maxVerificationAttempts = 3;

      const verifyFileAdded = () => {
        verificationAttempts++;
        const updatedStore = useFileTransferStore.getState();
        const fileExists = updatedStore.retrievedFiles.some(
          (f) => f.name === file.name && f.size === file.size
        );

        if (!fileExists && verificationAttempts < maxVerificationAttempts) {
          updatedStore.addRetrievedFile(file);
          setTimeout(verifyFileAdded, 10);
        }
      };

      // Perform first verification immediately
      verifyFileAdded();
    };
  }

  // Business methods
  public async joinRoom(roomId: string, isSender: boolean): Promise<void> {
    const peer = isSender ? this.sender : this.receiver;
    await peer.joinRoom(roomId, isSender);

    const setInRoom = isSender
      ? useFileTransferStore.getState().setIsSenderInRoom
      : useFileTransferStore.getState().setIsReceiverInRoom;
    setInRoom(true);
  }

  public async leaveRoom(isSender: boolean): Promise<void> {
    if (isSender) {
      await this.sender.leaveRoomAndCleanup();
      useFileTransferStore.getState().setIsSenderInRoom(false);
      useFileTransferStore.getState().setSharePeerCount(0);
    } else {
      await this.receiver.leaveRoomAndCleanup();
      useFileTransferStore.getState().setIsReceiverInRoom(false);
      useFileTransferStore.getState().setRetrievePeerCount(0);
    }
  }

  public async broadcastDataToAllPeers(): Promise<boolean> {
    const { shareContent, sendFiles } = useFileTransferStore.getState();
    const peerIds = Array.from(this.sender.peerConnections.keys());
    if (peerIds.length === 0) {
      console.warn("[WebRTC Service] No connected peers to broadcast to");
      return false;
    }

    try {
      await Promise.all(
        peerIds.map(async (peerId) => {
          if (shareContent) {
            await this.fileSender.sendString(shareContent, peerId);
          }
          if (sendFiles.length > 0) {
            this.fileSender.sendFileMeta(sendFiles, peerId);
          }
        })
      );
      return true;
    } catch (error) {
      console.error("[WebRTC Service] Broadcast failed:", error);
      return false;
    }
  }

  public requestFile(fileId: string): void {
    this.fileReceiver.requestFile(fileId);
  }

  public requestFolder(folderName: string): void {
    this.fileReceiver.requestFolder(folderName);
  }

  public async setReceiverDirectoryHandle(
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    return this.fileReceiver.setSaveDirectory(directoryHandle);
  }

  public getReceiverSaveType(): { [fileId: string]: boolean } | undefined {
    return this.fileReceiver.saveType;
  }

  public manualSafeSave(): void {
    this.fileReceiver.gracefulShutdown();
  }

  public async cleanup(): Promise<void> {
    console.log("[WebRTC Service] Starting cleanup...");
    try {
      await Promise.all([
        this.sender.cleanUpBeforeExit(),
        this.receiver.cleanUpBeforeExit(),
      ]);
      console.log("[WebRTC Service] Cleanup completed");
    } catch (error) {
      console.error("[WebRTC Service] Error during cleanup:", error);
    }
  }
}

export const webrtcService = WebRTCService.getInstance();
