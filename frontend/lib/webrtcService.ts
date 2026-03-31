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

export type WebRTCServiceRole = "sender" | "receiver";
export type TransferDirection = "send" | "receive";

export interface WebRTCSessionInfo {
  roomId: string | null;
  peerId: string | null;
  inRoom: boolean;
}

export type WebRTCServiceEvent =
  | {
      type: "connection_state_changed";
      role: WebRTCServiceRole;
      state: WebRTCStoreConnectionState;
      peerId: string;
    }
  | {
      type: "peer_count_changed";
      role: WebRTCServiceRole;
      count: number;
    }
  | {
      type: "room_status_changed";
      role: WebRTCServiceRole;
      inRoom: boolean;
    }
  | {
      type: "sender_disconnected_changed";
      disconnected: boolean;
    }
  | {
      type: "transfer_progress";
      direction: TransferDirection;
      fileId: string;
      peerId: string;
      progress: number;
      speed: number;
    }
  | {
      type: "retrieved_content";
      content: string;
    }
  | {
      type: "retrieved_file_meta";
      meta: fileMetadata;
    }
  | {
      type: "retrieved_file";
      file: CustomFile;
    }
  | {
      type: "transfer_progress_cleared";
      direction: TransferDirection;
      peerId?: string;
    }
  | {
      type: "sender_data_channel_opened";
    };

export interface WebRTCServiceObserver {
  onEvent: (event: WebRTCServiceEvent) => void;
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

  public getSessionInfo(role: WebRTCServiceRole): WebRTCSessionInfo {
    const connection = role === "sender" ? this.sender : this.receiver;

    return {
      roomId: connection.roomId,
      peerId: connection.peerId ?? null,
      inRoom: connection.isInRoom,
    };
  }

  private emitEvent(event: WebRTCServiceEvent): void {
    this.observer?.onEvent(event);
  }

  private initializeEventHandlers(): void {
    this.sender.onConnectionStateChange = (state, peerId) => {
      const normalizedState = this.normalizeConnectionState(state);
      console.log(
        `[WebRTC Service] Sender connection state: ${normalizedState} for peer ${peerId}`
      );

      this.emitEvent({
        type: "connection_state_changed",
        role: "sender",
        state: normalizedState,
        peerId,
      });

      if (normalizedState === "connected") {
        this.emitEvent({
          type: "peer_count_changed",
          role: "sender",
          count: this.sender.peerConnections.size,
        });
        console.log(
          `[WebRTC Service] Sender connected, peer count: ${this.sender.peerConnections.size}`
        );

        this.fileSender.setProgressCallback((fileId, progress, speed) => {
          this.emitEvent({
            type: "transfer_progress",
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
      this.emitEvent({ type: "sender_data_channel_opened" });
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

      this.emitEvent({
        type: "connection_state_changed",
        role: "receiver",
        state: normalizedState,
        peerId,
      });

      if (normalizedState === "connected") {
        this.emitEvent({
          type: "peer_count_changed",
          role: "receiver",
          count: this.receiver.peerConnections.size,
        });
        console.log(
          `[WebRTC Service] Receiver connected, peer count: ${this.receiver.peerConnections.size}`
        );

        this.fileReceiver.setProgressCallback((fileId, progress, speed) => {
          this.emitEvent({
            type: "transfer_progress",
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
      this.emitEvent({
        type: "sender_disconnected_changed",
        disconnected: false,
      });
      this.emitEvent({
        type: "room_status_changed",
        role: "receiver",
        inRoom: true,
      });
    };

    this.receiver.onPeerDisconnected = (peerId) => {
      console.log(`[WebRTC Service] Receiver peer disconnected: ${peerId}`);
      this.handleConnectionDisconnect(peerId, false, "PEER_DISCONNECTED");
    };

    this.fileReceiver.onStringReceived = (data) => {
      this.emitEvent({ type: "retrieved_content", content: data });
    };

    this.fileReceiver.onFileMetaReceived = (meta) => {
      this.emitEvent({ type: "retrieved_file_meta", meta });
    };

    this.fileReceiver.onFileReceived = async (file) => {
      this.emitEvent({ type: "retrieved_file", file });
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

    this.emitEvent({
      type: "room_status_changed",
      role: isSender ? "sender" : "receiver",
      inRoom: true,
    });
  }

  public async leaveRoom(isSender: boolean): Promise<void> {
    if (isSender) {
      this.fileSender.cleanup();
      await this.sender.leaveRoomAndCleanup();
      this.emitEvent({
        type: "room_status_changed",
        role: "sender",
        inRoom: false,
      });
      this.emitEvent({
        type: "peer_count_changed",
        role: "sender",
        count: 0,
      });
    } else {
      await this.fileReceiver.forceReset();
      await this.receiver.leaveRoomAndCleanup();
      this.emitEvent({
        type: "room_status_changed",
        role: "receiver",
        inRoom: false,
      });
      this.emitEvent({
        type: "peer_count_changed",
        role: "receiver",
        count: 0,
      });
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
      this.emitEvent({
        type: "peer_count_changed",
        role: "sender",
        count: this.sender.peerConnections.size,
      });
      console.log(
        `[WebRTC Service] Sender peer count: ${this.sender.peerConnections.size}`
      );
      return;
    }

    this.emitEvent({
      type: "peer_count_changed",
      role: "receiver",
      count: this.receiver.peerConnections.size,
    });
    this.emitEvent({
      type: "sender_disconnected_changed",
      disconnected: true,
    });
    console.log(
      `[WebRTC Service] Receiver peer count set to ${this.receiver.peerConnections.size}`
    );
  }

  private clearAllTransferProgress(): void {
    this.emitEvent({ type: "transfer_progress_cleared", direction: "send" });
    this.emitEvent({ type: "transfer_progress_cleared", direction: "receive" });
    console.log("[WebRTC Service] Cleared all transfer progress");
  }

  private clearPeerTransferProgress(
    peerId: string,
    direction: TransferDirection
  ): void {
    this.emitEvent({ type: "transfer_progress_cleared", direction, peerId });
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
