import WebRTC_Initiator from "@/lib/webrtc_Initiator";
import WebRTC_Recipient from "@/lib/webrtc_Recipient";
import FileSender from "@/lib/fileSender";
import FileReceiver from "@/lib/fileReceiver";
import { CustomFile, fileMetadata } from "@/types/webrtc";
import {
  getIceServers,
  getSocketOptions,
  config,
} from "@/app/config/environment";

export type WebRTCStoreConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export type TransferDirection = "send" | "receive";

export interface TransferProgressUpdate {
  direction: TransferDirection;
  fileId: string;
  peerId: string;
  progress: number;
  speed: number;
}

export interface WebRTCServiceObserver {
  onSenderConnectionStateChange?: (
    state: WebRTCStoreConnectionState,
    peerId: string
  ) => void;
  onReceiverConnectionStateChange?: (
    state: WebRTCStoreConnectionState,
    peerId: string
  ) => void;
  onSharePeerCountChange?: (count: number) => void;
  onRetrievePeerCountChange?: (count: number) => void;
  onSenderInRoomChange?: (inRoom: boolean) => void;
  onReceiverInRoomChange?: (inRoom: boolean) => void;
  onSenderDisconnectedChange?: (disconnected: boolean) => void;
  onTransferProgress?: (update: TransferProgressUpdate) => void;
  onRetrievedContent?: (content: string) => void;
  onRetrievedFileMeta?: (meta: fileMetadata) => void;
  onRetrievedFile?: (file: CustomFile) => void;
  onTransferProgressCleared?: (
    direction: TransferDirection,
    peerId?: string
  ) => void;
  onSenderDataChannelOpen?: () => void;
}

class WebRTCService {
  public sender: WebRTC_Initiator;
  public receiver: WebRTC_Recipient;
  public fileSender: FileSender;
  public fileReceiver: FileReceiver;

  private static instance: WebRTCService;
  private observer: WebRTCServiceObserver | null = null;

  private constructor() {
    const apiUrl = (config.API_URL || "").trim();
    // Use same-origin when API_URL is empty string because socket.io accepts it.
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

  public setObserver(observer: WebRTCServiceObserver | null): void {
    this.observer = observer;
  }

  private initializeEventHandlers(): void {
    this.sender.onConnectionStateChange = (state, peerId) => {
      const normalizedState = this.normalizeConnectionState(state);
      console.log(
        `[WebRTC Service] Sender connection state: ${normalizedState} for peer ${peerId}`
      );

      this.observer?.onSenderConnectionStateChange?.(normalizedState, peerId);

      if (normalizedState === "connected") {
        this.observer?.onSharePeerCountChange?.(this.sender.peerConnections.size);
        console.log(
          `[WebRTC Service] Sender connected, peer count: ${this.sender.peerConnections.size}`
        );

        this.fileSender.setProgressCallback((fileId, progress, speed) => {
          this.observer?.onTransferProgress?.({
            direction: "send",
            fileId,
            peerId,
            progress,
            speed,
          });
        }, peerId);
      } else if (
        normalizedState === "failed" ||
        normalizedState === "disconnected"
      ) {
        this.handleConnectionDisconnect(
          peerId,
          true,
          `CONNECTION_${normalizedState.toUpperCase()}`
        );
      }
    };

    this.sender.onDataChannelOpen = () => {
      this.observer?.onSenderDataChannelOpen?.();
    };

    this.sender.onPeerDisconnected = (peerId) => {
      console.log(`[WebRTC Service] Sender peer disconnected: ${peerId}`);
      this.handleConnectionDisconnect(peerId, true, "PEER_DISCONNECTED");
    };

    this.sender.onError = (error) => {
      console.error("[WebRTC Service] Sender error:", error.message);
      this.clearAllTransferProgress();
    };

    this.receiver.onConnectionStateChange = (state, peerId) => {
      const normalizedState = this.normalizeConnectionState(state);
      console.log(
        `[WebRTC Service] Receiver connection state: ${normalizedState} for peer ${peerId}`
      );

      this.observer?.onReceiverConnectionStateChange?.(normalizedState, peerId);

      if (normalizedState === "connected") {
        this.observer?.onRetrievePeerCountChange?.(
          this.receiver.peerConnections.size
        );
        console.log(
          `[WebRTC Service] Receiver connected, peer count: ${this.receiver.peerConnections.size}`
        );

        this.fileReceiver.setProgressCallback((fileId, progress, speed) => {
          this.observer?.onTransferProgress?.({
            direction: "receive",
            fileId,
            peerId,
            progress,
            speed,
          });
        });
      } else if (
        normalizedState === "failed" ||
        normalizedState === "disconnected"
      ) {
        this.handleConnectionDisconnect(
          peerId,
          false,
          `CONNECTION_${normalizedState.toUpperCase()}`
        );
      }
    };

    this.receiver.onConnectionEstablished = (peerId) => {
      this.fileSender.handlePeerReconnection(peerId);
      this.observer?.onSenderDisconnectedChange?.(false);
      this.observer?.onReceiverInRoomChange?.(true);
    };

    this.receiver.onPeerDisconnected = (peerId) => {
      console.log(`[WebRTC Service] Receiver peer disconnected: ${peerId}`);
      this.handleConnectionDisconnect(peerId, false, "PEER_DISCONNECTED");
    };

    this.fileReceiver.onStringReceived = (data) => {
      this.observer?.onRetrievedContent?.(data);
    };

    this.fileReceiver.onFileMetaReceived = (meta) => {
      this.observer?.onRetrievedFileMeta?.(meta);
    };

    this.fileReceiver.onFileReceived = async (file) => {
      this.observer?.onRetrievedFile?.(file);
    };
  }

  public async joinRoom(
    roomId: string,
    isSender: boolean,
    forceInitiatorOnline: boolean = false
  ): Promise<void> {
    if (!isSender) {
      await this.fileReceiver.forceReset();
    }

    const peer = isSender ? this.sender : this.receiver;
    await peer.joinRoom(roomId, isSender, isSender && !!forceInitiatorOnline);

    if (isSender) {
      this.observer?.onSenderInRoomChange?.(true);
    } else {
      this.observer?.onReceiverInRoomChange?.(true);
    }
  }

  public async leaveRoom(isSender: boolean): Promise<void> {
    if (isSender) {
      this.fileSender.cleanup();
      await this.sender.leaveRoomAndCleanup();
      this.observer?.onSenderInRoomChange?.(false);
      this.observer?.onSharePeerCountChange?.(0);
    } else {
      await this.fileReceiver.forceReset();
      await this.receiver.leaveRoomAndCleanup();
      this.observer?.onReceiverInRoomChange?.(false);
      this.observer?.onRetrievePeerCountChange?.(0);
    }
  }

  public async broadcastDataToAllPeers(
    shareContent: string,
    sendFiles: CustomFile[]
  ): Promise<boolean> {
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
            await this.fileSender.sendFileMeta(sendFiles, peerId);
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
    void this.fileReceiver.requestFile(fileId).catch((error) => {
      console.error("[WebRTC Service] requestFile failed:", error);
    });
  }

  public requestFolder(folderName: string): void {
    void this.fileReceiver.requestFolder(folderName).catch((error) => {
      console.error("[WebRTC Service] requestFolder failed:", error);
    });
  }

  public async setReceiverDirectoryHandle(
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    return this.fileReceiver.setSaveDirectory(directoryHandle);
  }

  public getReceiverSaveType(): Record<string, boolean> | undefined {
    return this.fileReceiver.saveType;
  }

  private normalizeConnectionState(
    state: RTCPeerConnectionState
  ): WebRTCStoreConnectionState {
    if (state === "connected" || state === "connecting" || state === "failed") {
      return state;
    }

    if (state === "closed" || state === "disconnected") {
      return "disconnected";
    }

    return "idle";
  }

  private handleConnectionDisconnect(
    peerId: string,
    isSender: boolean,
    reason: string
  ): void {
    console.log(
      `[WebRTC Service] Connection disconnect: ${reason}, peer: ${peerId}, sender: ${isSender}`
    );

    this.immediateTransferCleanup(peerId, isSender, reason);
    this.updateConnectionState(isSender);
  }

  private immediateTransferCleanup(
    peerId: string,
    isSender: boolean,
    reason: string
  ): void {
    if (isSender) {
      this.clearPeerTransferProgress(peerId, "send");
      return;
    }

    if (this.fileReceiver.hasActiveFileReception()) {
      console.log(
        `[WebRTC Service] Force cleaning receiver due to sender disconnect: ${reason}`
      );

      try {
        void this.fileReceiver
          .gracefulShutdown(`SENDER_${reason}`)
          .catch((error) => {
            console.error("[WebRTC Service] gracefulShutdown failed:", error);
          });
      } catch (error) {
        console.log(
          "[WebRTC Service] Expected error during graceful shutdown:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    this.clearPeerTransferProgress(peerId, "receive");
  }

  private updateConnectionState(isSender: boolean): void {
    if (isSender) {
      this.observer?.onSharePeerCountChange?.(this.sender.peerConnections.size);
      console.log(
        `[WebRTC Service] Sender peer count: ${this.sender.peerConnections.size}`
      );
      return;
    }

    this.observer?.onRetrievePeerCountChange?.(this.receiver.peerConnections.size);
    this.observer?.onSenderDisconnectedChange?.(true);
    console.log(
      `[WebRTC Service] Receiver peer count set to ${this.receiver.peerConnections.size}`
    );
  }

  private clearAllTransferProgress(): void {
    this.observer?.onTransferProgressCleared?.("send");
    this.observer?.onTransferProgressCleared?.("receive");
    console.log("[WebRTC Service] Cleared all transfer progress");
  }

  private clearPeerTransferProgress(
    peerId: string,
    direction: TransferDirection
  ): void {
    this.observer?.onTransferProgressCleared?.(direction, peerId);
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
