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

class WebRTCService {
  public sender: WebRTC_Initiator;
  public receiver: WebRTC_Recipient;
  public fileSender: FileSender;
  public fileReceiver: FileReceiver;

  private static instance: WebRTCService;

  private constructor() {
    const apiUrl = (config.API_URL || "").trim();
    // Use same-origin when API_URL is empty string — socket.io accepts empty string for same-origin
    const signalingServer: string = apiUrl.length > 0 ? apiUrl : "";
    const webRTCConfig = {
      iceServers: getIceServers(),
      socketOptions: getSocketOptions() || {},
      signalingServer,
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
      console.log(`[WebRTC Service] Sender connection state: ${state} for peer ${peerId}`);
      
      useFileTransferStore.getState().setShareConnectionState(state as any);
      if (state === "connected") {
        // update share peer count
        useFileTransferStore.getState().setSharePeerCount(this.sender.peerConnections.size);
        console.log(`[WebRTC Service] Sender connected, peer count: ${this.sender.peerConnections.size}`);
        
        this.fileSender.setProgressCallback((fileId, progress, speed) => {
          useFileTransferStore
            .getState()
            .updateSendProgress(fileId, peerId, { progress, speed });
        }, peerId);
      } else if (state === "failed" || state === "closed") {
        this.handleConnectionDisconnect(peerId, true, `CONNECTION_${state.toUpperCase()}`);
      }
    };

    this.sender.onDataChannelOpen = (_peerId) => {
      useFileTransferStore.getState().setIsSenderInRoom(true);
      // Automatically broadcast current content
      this.broadcastDataToAllPeers();
    };

    this.sender.onPeerDisconnected = (peerId) => {
      console.log(`[WebRTC Service] Sender peer disconnected: ${peerId}`);
      this.handleConnectionDisconnect(peerId, true, "PEER_DISCONNECTED");
    };

    this.sender.onError = (error) => {
      console.error("[WebRTC Service] Sender error:", error.message);
      // Clear all states on error
      this.clearAllTransferProgress();
    };

    // Receiver event handling
    this.receiver.onConnectionStateChange = (state, peerId) => {
      console.log(`[WebRTC Service] Receiver connection state: ${state} for peer ${peerId}`);
      
      useFileTransferStore.getState().setRetrieveConnectionState(state as any);

      if (state === "connected") {
        // update retrieve peer count
        useFileTransferStore.getState().setRetrievePeerCount(this.receiver.peerConnections.size);
        console.log(`[WebRTC Service] Receiver connected, peer count: ${this.receiver.peerConnections.size}`);
        
        this.fileReceiver.setProgressCallback((fileId, progress, speed) => {
          useFileTransferStore
            .getState()
            .updateReceiveProgress(fileId, peerId, { progress, speed });
        });
      } else if (state === "failed" || state === "closed") {
        this.handleConnectionDisconnect(peerId, false, `CONNECTION_${state.toUpperCase()}`);
      }
    };

    this.receiver.onConnectionEstablished = (peerId) => {
      this.fileSender.handlePeerReconnection(peerId);
      useFileTransferStore.getState().setSenderDisconnected(false);
      useFileTransferStore.getState().setIsReceiverInRoom(true);
    };

    this.receiver.onPeerDisconnected = (peerId) => {
      console.log(`[WebRTC Service] Receiver peer disconnected: ${peerId}`);
      this.handleConnectionDisconnect(peerId, false, "PEER_DISCONNECTED");
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
    };
  }

  // Business methods
  public async joinRoom(roomId: string, isSender: boolean): Promise<void> {
    // Ensure clean state before joining
    if (!isSender) {
      // Force reset FileReceiver state to prevent "already in progress" errors
      this.fileReceiver.forceReset();
    }

    const peer = isSender ? this.sender : this.receiver;
    await peer.joinRoom(roomId, isSender);

    const setInRoom = isSender
      ? useFileTransferStore.getState().setIsSenderInRoom
      : useFileTransferStore.getState().setIsReceiverInRoom;
    setInRoom(true);
  }


  public async leaveRoom(isSender: boolean): Promise<void> {
    if (isSender) {
      // Clean up sender
      this.fileSender.cleanup();
      await this.sender.leaveRoomAndCleanup();
      useFileTransferStore.getState().setIsSenderInRoom(false);
      useFileTransferStore.getState().setSharePeerCount(0);
    } else {
      // Clean up receiver - force reset to ensure complete cleanup
      this.fileReceiver.forceReset();
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

  private handleConnectionDisconnect(peerId: string, isSender: boolean, reason: string): void {
    console.log(`[WebRTC Service] Connection disconnect: ${reason}, peer: ${peerId}, sender: ${isSender}`);
    
    // Immediately clean up the transfer status to avoid UI freezing
    this.immediateTransferCleanup(peerId, isSender, reason);
    
    // update connection state
    this.updateConnectionState(peerId, isSender);
  }

  // Immediately clean up the transfer status
  private immediateTransferCleanup(peerId: string, isSender: boolean, reason: string): void {
    const store = useFileTransferStore.getState();
    
    if (isSender) {
      // Sender disconnected: clean up the sender related status
      this.clearPeerTransferProgress(peerId, true);
    } else {
      // Receiver side: sender disconnected, need to clean up the receiver status
      const { isAnyFileTransferring } = store;
      
      if (isAnyFileTransferring) {
        console.log(`[WebRTC Service] Force cleaning receiver due to sender disconnect: ${reason}`);
        
        // Catch the error that gracefulShutdown may throw
        try {
          this.fileReceiver.gracefulShutdown(`SENDER_${reason}`);
        } catch (error) {
          console.log(`[WebRTC Service] Expected error during graceful shutdown:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      this.clearPeerTransferProgress(peerId, false);
    }
  }

  // update connection state
  private updateConnectionState(_peerId: string, isSender: boolean): void {
    const store = useFileTransferStore.getState();
    
    if (isSender) {
      // Sender disconnected: clean up the sender related status
      const currentShareCount = store.sharePeerCount;
      store.setSharePeerCount(Math.max(0, currentShareCount - 1));
      console.log(`[WebRTC Service] Sender peer count: ${currentShareCount} → ${Math.max(0, currentShareCount - 1)}`);
    } else {
      // Receiver side: sender disconnected, need to clean up the receiver status
      store.setRetrievePeerCount(0);
      store.setSenderDisconnected(true);
      console.log(`[WebRTC Service] Receiver peer count set to 0`);
    }
  }

  // Clear all transfer progress
  private clearAllTransferProgress(): void {
    const store = useFileTransferStore.getState();
    store.setSendProgress({});
    store.setReceiveProgress({});
    store.setIsAnyFileTransferring(false);
    console.log(`[WebRTC Service] Cleared all transfer progress`);
  }

  private clearPeerTransferProgress(peerId: string, isSender: boolean): void {
    const store = useFileTransferStore.getState();
    const progressState = isSender ? store.sendProgress : store.receiveProgress;

    // Clear transfer progress for this peer
    const newProgress = { ...progressState };
    Object.keys(newProgress).forEach((fileId) => {
      if (newProgress[fileId][peerId]) {
        delete newProgress[fileId][peerId];
        // If no other peers are transferring this file, remove the file record
        if (Object.keys(newProgress[fileId]).length === 0) {
          delete newProgress[fileId];
        }
      }
    });

    if (isSender) {
      store.setSendProgress(newProgress);
    } else {
      store.setReceiveProgress(newProgress);
    }

    // Recalculate isAnyFileTransferring status
    const allProgress = [
      ...Object.values(isSender ? newProgress : store.sendProgress),
      ...Object.values(isSender ? store.receiveProgress : newProgress),
    ];
    const hasActiveTransfers = allProgress.some((fileProgress: any) => {
      return Object.values(fileProgress).some((progress: any) => {
        return progress.progress > 0 && progress.progress < 1;
      });
    });

    if (!hasActiveTransfers) {
      store.setIsAnyFileTransferring(false);
    }
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
