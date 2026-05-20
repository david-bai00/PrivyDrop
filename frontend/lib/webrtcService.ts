import WebRTC_Initiator from "@/lib/webrtc_Initiator";
import WebRTC_Recipient from "@/lib/webrtc_Recipient";
import FileSender from "@/lib/fileSender";
import FileReceiver from "@/lib/fileReceiver";
import { CustomFile, fileMetadata, PayloadSnapshot } from "@/types/webrtc";
import type { BaseWebRTCLifecycleEvent } from "@/lib/webrtc_base";
import {
  WebRTCLifecycleState,
  WebRTCConnectionBadgeState,
} from "@/types/webrtcLifecycle";
import {
  normalizeRtcConnectionState,
  type NormalizedRtcConnectionState,
  resolveLifecycleStateAfterDisconnect,
  resolveLifecycleStateFromPeerEvent,
  resolveLifecycleStateFromPeerSnapshot,
  summarizePeerConnectionStates,
} from "@/lib/webrtcLifecycleMachine";
import {
  getIceServers,
  getSocketOptions,
  config,
} from "@/app/config/environment";
import { createLogger } from "@/lib/logger";
import {
  SenderShutdownAction,
  getSenderShutdownPolicy,
} from "@/lib/transfer/senderShutdown";
import { ReceiverShutdownAction } from "@/lib/receive";

const logger = createLogger({ scope: "WebRTC.Service" });

export type WebRTCStoreConnectionState = WebRTCConnectionBadgeState;

export type WebRTCServiceRole = "sender" | "receiver";
export type TransferDirection = "send" | "receive";

export interface WebRTCSessionInfo {
  roomId: string | null;
  peerId: string | null;
  inRoom: boolean;
}

export type WebRTCServiceEvent =
  | {
      type: "lifecycle_state_changed";
      role: WebRTCServiceRole;
      state: WebRTCLifecycleState;
      previousState: WebRTCLifecycleState;
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
      type: "retrieved_payload_snapshot";
      snapshot: PayloadSnapshot;
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
  private lifecycleStates: Record<WebRTCServiceRole, WebRTCLifecycleState> = {
    sender: "idle",
    receiver: "idle",
  };
  private peerConnectionStates: Record<
    WebRTCServiceRole,
    Map<string, NormalizedRtcConnectionState>
  > = {
    sender: new Map(),
    receiver: new Map(),
  };
  private receiverShutdownInProgress = false;
  private receiverInterruptSuppressionUntil = 0;

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

  public getLifecycleState(role: WebRTCServiceRole): WebRTCLifecycleState {
    return this.lifecycleStates[role];
  }

  private emitEvent(event: WebRTCServiceEvent): void {
    this.observer?.onEvent(event);
  }

  private initializeEventHandlers(): void {
    this.sender.onLifecycleEvent = (event) => {
      this.handlePeerLifecycleEvent("sender", event);
    };

    this.sender.onConnectionStateChange = (state, peerId) => {
      const normalizedState = normalizeRtcConnectionState(state);
      logger.info({
        event: "sender_connection_state_changed",
        context: {
          state: normalizedState,
          peerId,
        },
      });

      if (normalizedState === "connected") {
        this.setPeerConnectionState("sender", peerId, normalizedState);
        this.syncLifecycleStateFromPeerSnapshot("sender");
        this.emitEvent({
          type: "peer_count_changed",
          role: "sender",
          count: this.sender.peerConnections.size,
        });
        logger.info({
          event: "sender_connected",
          context: {
            peerCount: this.sender.peerConnections.size,
          },
        });

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
      } else if (normalizedState === "negotiating") {
        this.setPeerConnectionState("sender", peerId, normalizedState);
        this.syncLifecycleStateFromPeerSnapshot("sender");
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

    this.sender.onConnectionEstablished = (peerId) => {
      this.fileSender.handlePeerReconnection(peerId);
    };

    this.sender.onPeerDisconnected = (peerId) => {
      logger.info({
        event: "sender_peer_disconnected",
        context: { peerId },
      });
      this.handleConnectionDisconnect(peerId, true, "PEER_DISCONNECTED");
    };

    this.sender.onError = (error) => {
      logger.error({
        event: "sender_error",
        context: { message: error.message },
      });
      this.clearPeerConnectionStates("sender");
      this.setLifecycleState("sender", "failed");
      this.clearAllTransferProgress();
    };

    this.receiver.onLifecycleEvent = (event) => {
      this.handlePeerLifecycleEvent("receiver", event);
    };

    this.receiver.onConnectionStateChange = (state, peerId) => {
      const normalizedState = normalizeRtcConnectionState(state);
      logger.info({
        event: "receiver_connection_state_changed",
        context: {
          state: normalizedState,
          peerId,
        },
      });

      if (normalizedState === "connected") {
        this.setPeerConnectionState("receiver", peerId, normalizedState);
        this.syncLifecycleStateFromPeerSnapshot("receiver");
        this.fileReceiver.setCurrentPeerId(peerId);
        this.emitEvent({
          type: "peer_count_changed",
          role: "receiver",
          count: this.receiver.peerConnections.size,
        });
        this.emitEvent({
          type: "sender_disconnected_changed",
          disconnected: false,
        });
        logger.info({
          event: "receiver_connected",
          context: {
            peerCount: this.receiver.peerConnections.size,
          },
        });

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
      } else if (normalizedState === "negotiating") {
        this.setPeerConnectionState("receiver", peerId, normalizedState);
        this.syncLifecycleStateFromPeerSnapshot("receiver");
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
      this.setPeerConnectionState("receiver", peerId, "connected");
      this.syncLifecycleStateFromPeerSnapshot("receiver");
      this.fileReceiver.setCurrentPeerId(peerId);
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
      logger.info({
        event: "receiver_peer_disconnected",
        context: { peerId },
      });
      this.handleConnectionDisconnect(peerId, false, "PEER_DISCONNECTED");
    };

    this.receiver.onError = (error) => {
      logger.error({
        event: "receiver_error",
        context: { message: error.message },
      });
      this.clearPeerConnectionStates("receiver");
      this.setLifecycleState("receiver", "failed");
      this.clearAllTransferProgress();
    };

    this.fileReceiver.onStringReceived = (data) => {
      this.emitEvent({ type: "retrieved_content", content: data });
    };

    this.fileReceiver.onPayloadSnapshotReceived = (snapshot) => {
      this.emitEvent({ type: "retrieved_payload_snapshot", snapshot });
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
      await this.fileReceiver.shutdown("force_reset", "JOIN_NEW_ROOM");
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
      await this.shutdownSender("leave_room");
    } else {
      await this.shutdownReceiver("leave_room");
    }
  }

  public async shutdownSender(action: SenderShutdownAction): Promise<void> {
    const policy = getSenderShutdownPolicy(action);
    this.fileSender.shutdown(action);

    if (policy.keepSocketAlive) {
      await this.sender.leaveRoomAndCleanup();
    } else {
      await this.sender.cleanUpBeforeExit();
    }

    this.emitEvent({
      type: "room_status_changed",
      role: "sender",
      inRoom: false,
    });
    this.clearPeerConnectionStates("sender");
    this.emitEvent({
      type: "peer_count_changed",
      role: "sender",
      count: 0,
    });
    this.emitEvent({ type: "transfer_progress_cleared", direction: "send" });
  }

  public async shutdownReceiver(action: ReceiverShutdownAction): Promise<void> {
    this.receiverShutdownInProgress = true;
    this.receiverInterruptSuppressionUntil = Date.now() + 15000;
    try {
      await this.fileReceiver.shutdown(action, `SERVICE_${action.toUpperCase()}`);

      if (action === "cleanup") {
        await this.receiver.cleanUpBeforeExit();
      } else if (action === "leave_room") {
        await this.receiver.leaveRoomAndCleanup();
      }

      this.emitEvent({
        type: "room_status_changed",
        role: "receiver",
        inRoom: false,
      });
      this.clearPeerConnectionStates("receiver");
      this.emitEvent({
        type: "peer_count_changed",
        role: "receiver",
        count: 0,
      });
      this.emitEvent({
        type: "sender_disconnected_changed",
        disconnected: false,
      });
      this.emitEvent({ type: "transfer_progress_cleared", direction: "receive" });
    } finally {
      this.receiverShutdownInProgress = false;
    }
  }

  public async broadcastDataToAllPeers(
    shareContent: string,
    sendFiles: CustomFile[]
  ): Promise<boolean> {
    const peerIds = Array.from(this.sender.peerConnections.keys());
    if (peerIds.length === 0) {
      logger.warn({
        event: "broadcast_skipped_no_connected_peers",
      });
      return false;
    }

    try {
      await Promise.all(
        peerIds.map(async (peerId) => {
          await this.fileSender.sendPayloadSnapshot(
            shareContent,
            sendFiles,
            peerId
          );

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
      logger.error({
        event: "broadcast_failed",
        context: { error },
      });
      return false;
    }
  }

  public requestFile(fileId: string): void {
    void this.fileReceiver.requestFile(fileId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !this.receiver.isInRoom ||
        this.receiverShutdownInProgress ||
        Date.now() < this.receiverInterruptSuppressionUntil ||
        this.lifecycleStates.receiver !== "connected" ||
        message.includes("LEAVE_ROOM") ||
        message.includes("leaving_room")
      ) {
        logger.info({
          event: "request_file_interrupted",
          context: { fileId, message },
        });
        return;
      }

      logger.error({
        event: "request_file_failed",
        context: { fileId, error },
      });
    });
  }

  public requestFolder(folderName: string): void {
    void this.fileReceiver.requestFolder(folderName).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !this.receiver.isInRoom ||
        this.receiverShutdownInProgress ||
        Date.now() < this.receiverInterruptSuppressionUntil ||
        this.lifecycleStates.receiver !== "connected" ||
        message.includes("LEAVE_ROOM") ||
        message.includes("leaving_room")
      ) {
        logger.info({
          event: "request_folder_interrupted",
          context: { folderName, message },
        });
        return;
      }

      logger.error({
        event: "request_folder_failed",
        context: { folderName, error },
      });
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

  private handlePeerLifecycleEvent(
    role: WebRTCServiceRole,
    event: BaseWebRTCLifecycleEvent
  ): void {
    if (event.type === "join_started" || event.type === "leave_completed") {
      this.clearPeerConnectionStates(role);
    }

    this.setLifecycleState(
      role,
      resolveLifecycleStateFromPeerEvent(event, this.getPeerConnectionCount(role))
    );
  }

  private getPeerConnectionCount(role: WebRTCServiceRole): number {
    return role === "sender"
      ? this.sender.peerConnections.size
      : this.receiver.peerConnections.size;
  }

  private setLifecycleState(
    role: WebRTCServiceRole,
    state: WebRTCLifecycleState
  ): void {
    const previousState = this.lifecycleStates[role];
    if (previousState === state) {
      return;
    }

    this.lifecycleStates[role] = state;
    this.emitEvent({
      type: "lifecycle_state_changed",
      role,
      state,
      previousState,
    });
  }

  private handleConnectionDisconnect(
    peerId: string,
    isSender: boolean,
    reason: string
  ): void {
    logger.info({
      event: "connection_disconnected",
      context: { reason, peerId, isSender },
    });

    this.immediateTransferCleanup(peerId, isSender, reason);
    const role: WebRTCServiceRole = isSender ? "sender" : "receiver";
    this.clearPeerConnectionState(role, peerId);
    if (reason === "PEER_DISCONNECTED") {
      this.syncLifecycleStateFromPeerSnapshot(role);
    } else {
      this.syncLifecycleStateAfterDisconnect(role);
    }
    this.updateConnectionState(isSender);
  }

  private setPeerConnectionState(
    role: WebRTCServiceRole,
    peerId: string,
    state: NormalizedRtcConnectionState
  ): void {
    this.peerConnectionStates[role].set(peerId, state);
  }

  private clearPeerConnectionState(
    role: WebRTCServiceRole,
    peerId: string
  ): void {
    this.peerConnectionStates[role].delete(peerId);
  }

  private clearPeerConnectionStates(role: WebRTCServiceRole): void {
    this.peerConnectionStates[role].clear();
  }

  private syncLifecycleStateFromPeerSnapshot(role: WebRTCServiceRole): void {
    const connection = role === "sender" ? this.sender : this.receiver;
    this.setLifecycleState(
      role,
      resolveLifecycleStateFromPeerSnapshot({
        currentState: this.lifecycleStates[role],
        inRoom: connection.isInRoom,
        peerSummary: summarizePeerConnectionStates(
          Array.from(this.peerConnectionStates[role].values())
        ),
      })
    );
  }

  private syncLifecycleStateAfterDisconnect(role: WebRTCServiceRole): void {
    const connection = role === "sender" ? this.sender : this.receiver;
    this.setLifecycleState(
      role,
      resolveLifecycleStateAfterDisconnect({
        currentState: this.lifecycleStates[role],
        inRoom: connection.isInRoom,
        peerSummary: summarizePeerConnectionStates(
          Array.from(this.peerConnectionStates[role].values())
        ),
      })
    );
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
      logger.info({
        event: "receiver_force_cleanup_after_disconnect",
        context: { reason },
      });

      try {
        void this.fileReceiver
          .handlePeerDisconnect(`SENDER_${reason}`)
          .catch((error: unknown) => {
            logger.error({
              event: "receiver_disconnect_cleanup_failed",
              context: { error },
            });
          });
      } catch (error) {
        logger.info({
          event: "receiver_graceful_shutdown_expected_error",
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
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
      logger.info({
        event: "sender_peer_count_updated",
        context: {
          peerCount: this.sender.peerConnections.size,
        },
      });
      return;
    }

    this.emitEvent({
      type: "peer_count_changed",
      role: "receiver",
      count: this.receiver.peerConnections.size,
    });
    this.emitEvent({
      type: "sender_disconnected_changed",
      disconnected: this.receiver.peerConnections.size === 0,
    });
    logger.info({
      event: "receiver_peer_count_updated",
      context: {
        peerCount: this.receiver.peerConnections.size,
      },
    });
  }

  private clearAllTransferProgress(): void {
    this.emitEvent({ type: "transfer_progress_cleared", direction: "send" });
    this.emitEvent({ type: "transfer_progress_cleared", direction: "receive" });
    logger.info({
      event: "all_transfer_progress_cleared",
    });
  }

  private clearPeerTransferProgress(
    peerId: string,
    direction: TransferDirection
  ): void {
    this.emitEvent({ type: "transfer_progress_cleared", direction, peerId });
  }

  public async cleanup(): Promise<void> {
    logger.info({
      event: "service_cleanup_started",
    });
    try {
      await Promise.all([
        this.shutdownSender("cleanup"),
        this.shutdownReceiver("cleanup"),
      ]);
      this.setLifecycleState("sender", "idle");
      this.setLifecycleState("receiver", "idle");
      logger.info({
        event: "service_cleanup_completed",
      });
    } catch (error) {
      logger.error({
        event: "service_cleanup_failed",
        context: { error },
      });
    }
  }
}

export const webrtcService = WebRTCService.getInstance();
