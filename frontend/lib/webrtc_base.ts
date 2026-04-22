// BaseWebRTC.js
import io, { Socket, ManagerOptions, SocketOptions } from "socket.io-client";
import { WakeLockManager } from "./wakeLockManager";
import { BroadcastResult, SendResult } from "@/types/webrtc";
import { createLogger, type RuntimeLogLevel } from "@/lib/logger";
import {
  buildBroadcastResult,
  buildSendResult,
  sendToPeerWithRetry,
} from "@/lib/webrtcSendMachine";
import {
  cleanupPeerCollection,
  mapPeerCollection,
} from "@/lib/webrtcConnectionCollection";

const logger = createLogger({ scope: "WebRTC.Base" });

export class WebRTCError extends Error {
  constructor(message: string, public context?: Record<string, any>) {
    super(message);
    this.name = "WebRTCError";
  }
}

interface JoinRoomResponse {
  success: boolean;
  message: string;
  roomId: string;
  error?: string;
}

interface CallbackTypes {
  onDataChannelOpen?: (peerId: string) => void;
  onDataReceived?: (data: string | ArrayBuffer, peerId: string) => void;
  onConnectionEstablished?: (peerId: string) => void;
  onConnectionStateChange?: (
    state: RTCPeerConnectionState,
    peerId: string
  ) => void;
  onPeerDisconnected?: (peerId: string) => void;
  onError?: (error: WebRTCError) => void;
  onLifecycleEvent?: (event: BaseWebRTCLifecycleEvent) => void;
}

export type BaseWebRTCLifecycleEvent =
  | {
      type: "join_started";
      roomId: string;
      isInitiator: boolean;
    }
  | {
      type: "join_succeeded";
      roomId: string;
      isInitiator: boolean;
    }
  | {
      type: "join_failed";
      roomId: string;
      isInitiator: boolean;
      error: string;
    }
  | {
      type: "reconnect_started";
      roomId: string;
      isInitiator: boolean;
    }
  | {
      type: "reconnect_succeeded";
      roomId: string;
      isInitiator: boolean;
    }
  | {
      type: "reconnect_failed";
      roomId: string;
      isInitiator: boolean;
      error: string;
    }
  | {
      type: "leave_started";
      roomId: string | null;
      isInitiator: boolean;
    }
  | {
      type: "leave_completed";
      roomId: string | null;
      isInitiator: boolean;
    };

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  socketOptions: Partial<ManagerOptions & SocketOptions>;
  signalingServer: string; // The URL of the signaling server for initializing the Socket.IO connection.
}

export default class BaseWebRTC {
  // Type declarations
  protected iceServers: RTCIceServer[];
  protected socket: Socket;
  public peerConnections: Map<string, RTCPeerConnection>;
  public dataChannels: Map<string, RTCDataChannel>;

  public onDataChannelOpen: CallbackTypes["onDataChannelOpen"] | null;
  public onDataReceived: CallbackTypes["onDataReceived"] | null;
  public onConnectionEstablished:
    | CallbackTypes["onConnectionEstablished"]
    | null;
  public onConnectionStateChange:
    | CallbackTypes["onConnectionStateChange"]
    | null;
  public onPeerDisconnected: CallbackTypes["onPeerDisconnected"] | null;
  public onError: CallbackTypes["onError"] | null;
  public onLifecycleEvent: CallbackTypes["onLifecycleEvent"] | null;

  protected iceCandidatesQueue: Map<string, RTCIceCandidateInit[]>;
  public roomId: string | null;
  public peerId: string | undefined | null;
  public isInRoom: boolean;
  protected isInitiator: boolean; // Flag for the initiator
  // Reconnection related
  protected isSocketDisconnected: boolean; // Tracks socket connection status
  protected isPeerDisconnected: boolean; // Tracks P2P connection status
  protected reconnectionInProgress: boolean; // Prevents duplicate reconnections
  protected wakeLockManager: WakeLockManager;
  // Graceful disconnect tracking
  protected gracefullyDisconnectedPeers: Set<string>;
  // Track last socket.id used to successfully join a room
  protected lastJoinedSocketId: string | null;

  constructor(config: WebRTCConfig) {
    this.iceServers = config.iceServers;
    this.socket = io(config.signalingServer, config.socketOptions);
    this.peerConnections = new Map(); // Map<targetPeerId, RTCPeerConnection>
    this.dataChannels = new Map(); // Map<targetPeerId, RTCDataChannel>

    // Callbacks
    this.onDataChannelOpen = null; // Callback for when the data channel is established
    this.onDataReceived = null; // Callback for receiving data
    this.onConnectionEstablished = null; // Triggered when the WebRTC connection is established
    this.onConnectionStateChange = null; // Monitors and responds to connection state changes
    this.onPeerDisconnected = null;
    this.onError = null;
    this.onLifecycleEvent = null;

    this.iceCandidatesQueue = new Map(); // Stores ICE candidates for each peer
    this.roomId = null;
    this.peerId = null; // Own ID
    this.isInRoom = false; // Whether the user has already joined a room
    this.gracefullyDisconnectedPeers = new Set(); // Track peers that disconnected gracefully
    this.setupCommonSocketListeners();

    this.isInitiator = false;

    this.isSocketDisconnected = false;
    this.isPeerDisconnected = false;
    this.reconnectionInProgress = false;
    this.wakeLockManager = new WakeLockManager();
    this.lastJoinedSocketId = null;
  }
  // region Logging and Error Handling
  protected log(
    level: RuntimeLogLevel,
    event: string,
    context?: unknown
  ) {
    logger[level]({
      event,
      context,
    });
  }

  public fireError(message: string, context?: Record<string, any>) {
    const error = new WebRTCError(message, context);
    this.log("error", "error_reported", {
      message,
      ...(context ? { context } : {}),
    });
    this.onError?.(error);
  }
  // endregion
  // Sets up event listeners for the signaling server to handle various signaling messages (connection, ICE candidates, offer, answer, etc.).
  setupCommonSocketListeners() {
    this.socket.on("connect", async () => {
      this.peerId = this.socket.id; // Save own ID
      this.isSocketDisconnected = false;
      this.log("info", "socket_connected", {
        peerId: this.peerId,
      });

      // Auto re-join if we previously joined a room but socket.id changed
      const hasRoom = !!this.roomId;
      const currentSocketId = this.socket.id ?? null;
      const socketIdChanged =
        this.lastJoinedSocketId !== null &&
        this.lastJoinedSocketId !== currentSocketId;

      if (hasRoom && (socketIdChanged || !this.isInRoom)) {
        // Ensure joinRoom does not early-return
        if (socketIdChanged) this.isInRoom = false;

        if (!this.reconnectionInProgress) {
          this.reconnectionInProgress = true;
          try {
            const sendInitiatorOnline = this.isInitiator;
            await this.joinRoom(
              this.roomId as string,
              this.isInitiator,
              sendInitiatorOnline
            );
            // Reset flags after successful auto rejoin
            this.isSocketDisconnected = false;
            this.isPeerDisconnected = false;
          } catch (error) {
            this.fireError("Auto rejoin on socket connect failed", { error });
          } finally {
            this.reconnectionInProgress = false;
          }
        }
      }
    });

    this.socket.on("error", (error) => {
      this.fireError("Socket error", { error });
    });

    this.socket.on("ice-candidate", ({ candidate, peerId, from }) => {
      // Recipient's peerId
      // console.log(`Received ICE candidate from ${from} for ${peerId}`);
      this.handleIceCandidate({ candidate, peerId, from });
    });
    // Add listener for socket disconnection
    this.socket.on("disconnect", () => {
      this.isInRoom = false;
      this.isSocketDisconnected = true;
      logger.debug({
        event: "socket_disconnected",
        context: {
          peerId: this.peerId,
          isInitiator: this.isInitiator,
          isInRoom: this.isInRoom,
        },
      });
      // Attempt to reconnect. On mobile, switching to the background disconnects both P2P and socket connections.
      // The disconnect code executes upon returning, so reconnect directly here; send a new signal to start reconnection.
      this.attemptReconnection();
    });

    this.socket.on("peer-disconnected", async ({ peerId }) => {
      this.log("info", "peer_disconnected", { peerId });
      this.markPeerGracefullyDisconnected(peerId);
      await this.cleanupExistingConnection(peerId);
      this.onPeerDisconnected?.(peerId);
    });
  }
  protected async attemptReconnection(): Promise<void> {
    if (this.reconnectionInProgress) return;
    if (!this.roomId) return;

    const currentSocketId = this.socket.id ?? null;
    const socketIdChanged =
      this.lastJoinedSocketId !== null &&
      this.lastJoinedSocketId !== currentSocketId;

    // Widen condition: if either side disconnected or socketId changed, try to rejoin
    if (this.isPeerDisconnected || this.isSocketDisconnected || socketIdChanged) {
      this.reconnectionInProgress = true;
      this.onLifecycleEvent?.({
        type: "reconnect_started",
        roomId: this.roomId,
        isInitiator: this.isInitiator,
      });
      logger.debug({
        event: "reconnect_started",
        context: {
          socketDisconnected: this.isSocketDisconnected,
          peerDisconnected: this.isPeerDisconnected,
          socketIdChanged,
          isInitiator: this.isInitiator,
        },
      });

      try {
        // Ensure joinRoom does not early-return
        if (socketIdChanged) this.isInRoom = false;
        const sendInitiatorOnline = this.isInitiator;
        await this.joinRoom(this.roomId, this.isInitiator, sendInitiatorOnline);

        // Reset states
        this.isSocketDisconnected = false;
        this.isPeerDisconnected = false;
        this.onLifecycleEvent?.({
          type: "reconnect_succeeded",
          roomId: this.roomId,
          isInitiator: this.isInitiator,
        });
      } catch (error) {
        this.onLifecycleEvent?.({
          type: "reconnect_failed",
          roomId: this.roomId,
          isInitiator: this.isInitiator,
          error: error instanceof Error ? error.message : String(error),
        });
        this.fireError("Reconnection failed", { error });
      } finally {
        this.reconnectionInProgress = false;
      }
    }
  }
  protected async handleIceCandidate({
    candidate,
    peerId,
    from,
  }: {
    candidate: RTCIceCandidateInit;
    peerId: string;
    from: string;
  }): Promise<void> {
    // this.log('log',`Handling ICE candidate from ${from} for ${peerId}`);
    const peerConnection = this.peerConnections.get(from);
    // this.log('log',`this.peerConnections`,this.peerConnections);
    if (!peerConnection) {
      // this.log('warn',`No peer connection found for ${from}, queuing candidate`);
      if (!this.iceCandidatesQueue.has(from)) {
        this.iceCandidatesQueue.set(from, []);
      }
      this.iceCandidatesQueue.get(from)?.push(candidate);
      return;
    }
    try {
      // Only add ICE candidates if the remote description is set and the connection is not closed
      if (
        peerConnection.remoteDescription &&
        peerConnection.signalingState !== "closed" &&
        peerConnection.connectionState !== "closed"
      ) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        // this.log('log',`Successfully added ICE candidate for ${from}`);
      } else {
        // this.log('warn',`Remote description not set or connection closed for ${from}, queuing candidate`);
        // this.log('warn',`remoteDescription`,peerConnection.remoteDescription,'peerConnection.signalingState',peerConnection.signalingState);
        if (!this.iceCandidatesQueue.has(from)) {
          this.iceCandidatesQueue.set(from, []);
        }
        this.iceCandidatesQueue.get(from)?.push(candidate);
      }
    } catch (e) {
      this.fireError(`Error adding ICE candidate for ${from}`, { error: e });
      // If adding fails, also add it to the queue
      if (!this.iceCandidatesQueue.has(from)) {
        this.iceCandidatesQueue.set(from, []);
      }
      this.iceCandidatesQueue.get(from)?.push(candidate);
    }
  }

  protected async addQueuedIceCandidates(peerId: string): Promise<void> {
    const candidates = this.iceCandidatesQueue.get(peerId);
    const peerConnection = this.peerConnections.get(peerId);

    if (!peerConnection || !candidates?.length) {
      return;
    }

    if (
      peerConnection.remoteDescription &&
      peerConnection.signalingState !== "closed" &&
      peerConnection.connectionState !== "closed"
    ) {
      // this.log('log',`Adding ${candidates.length} queued candidates for ${peerId}`);

      for (const candidate of candidates) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          // this.log('log',`Successfully added queued candidate for ${peerId}`);
        } catch (e) {
          this.fireError("Error adding queued ice candidates", {
            error: e,
            peerId,
          });
        }
      }
      // Only clear the queue after successfully adding all candidates
      this.iceCandidatesQueue.delete(peerId);
    } else {
      this.log(
        "warn",
        "ice_candidates_kept_queued",
        { peerId }
      );
      // this.log('warn',`remoteDescription`,peerConnection?.remoteDescription);
    }
  }

  protected async createPeerConnection(
    peerId: string
  ): Promise<RTCPeerConnection> {
    // this.log('log','Creating peer connection for:', peerId);
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      // this.log('log','Reusing existing peer connection for:', peerId);
      return Promise.resolve(peerConnection);
    }
    // WebRTC provides strong encryption by default. It's necessary to switch to the HTTPS protocol upon deployment.
    const newPeerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    newPeerConnection.onconnectionstatechange = () => {
      // const state = newPeerConnection.connectionState;
      // this.log('log',`Connection State (${peerId}):`, state);
      this.handleConnectionStateChange(peerId, newPeerConnection);
    };
    // Improve ICE candidate handling
    newPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // this.log('log',`Sending ICE candidate to ${peerId}:`, event.candidate);
        this.socket.emit("ice-candidate", {
          candidate: event.candidate,
          peerId: peerId,
          from: this.socket.id, // Add sender ID
        });
      }
    };

    this.peerConnections.set(peerId, newPeerConnection);
    // this.log('log','New peer connection created for:', peerId);
    return Promise.resolve(newPeerConnection);
  }

  protected handleConnectionStateChange(
    peerId: string,
    peerConnection: RTCPeerConnection
  ): void {
    const state = peerConnection.connectionState;
    // this.log('log','Connection state change:', state);

    const stateHandlers = {
      connected: async () => {
        this.isPeerDisconnected = false;
        const dataChannel = this.dataChannels.get(peerId);
        if (!dataChannel) {
          this.createDataChannel(peerId);
        }
        this.onConnectionEstablished?.(peerId);
        // Request wake lock when connection is established
        await this.wakeLockManager.requestWakeLock();
      },
      disconnected: async () => {
        await this.cleanupExistingConnection(peerId);
        this.isPeerDisconnected = true;
        logger.debug({
          event: "peer_connection_disconnected",
          context: {
            peerId,
            isInitiator: this.isInitiator,
          },
        });
        // Attempt to reconnect
        this.attemptReconnection();
        await this.wakeLockManager.releaseWakeLock();
      },
      failed: async () => {
        this.cleanupExistingConnection(peerId);
        this.isPeerDisconnected = true;
        // Attempt to reconnect as well when failed
        this.attemptReconnection();
        await this.wakeLockManager.releaseWakeLock();
      },
      closed: async () => {
        this.cleanupExistingConnection(peerId);
        this.isPeerDisconnected = true;
        // Attempt to reconnect when closed
        this.attemptReconnection();
        await this.wakeLockManager.releaseWakeLock();
      },
      // The following must be added to prevent errors
      connecting: () => {
        this.log("info", "peer_connecting", { peerId });
      },
      new: () => {
        this.log("info", "peer_connection_new", { peerId });
      },
    };

    stateHandlers[state]?.();
    this.onConnectionStateChange?.(state, peerId);
  }

  protected setupDataChannel(
    dataChannel: RTCDataChannel,
    peerId: string
  ): void {
    dataChannel.onopen = () => {
      // this.log('log',`Data channel opened for peer ${peerId}`);
      setTimeout(() => {
        this.onDataChannelOpen?.(peerId);
      }, 50);
    };

    dataChannel.onmessage = (event) => {
      // Enhanced data type detection - supports multiple binary data formats in Firefox
      let dataType = "Unknown";
      let dataSize = 0;

      if (typeof event.data === "string") {
        dataType = "String";
        dataSize = event.data.length;
      } else if (event.data instanceof ArrayBuffer) {
        dataType = "ArrayBuffer";
        dataSize = event.data.byteLength;
      } else if (event.data instanceof Blob) {
        dataType = "Blob";
        dataSize = event.data.size;
      } else if (event.data instanceof Uint8Array) {
        dataType = "Uint8Array";
        dataSize = event.data.byteLength;
      } else if (ArrayBuffer.isView(event.data)) {
        dataType = "TypedArray";
        dataSize = event.data.byteLength;
      } else {
        // Detailed unknown type debug information
        dataType = `Unknown(${Object.prototype.toString.call(event.data)})`;
        dataSize =
          event.data?.length || event.data?.size || event.data?.byteLength || 0;
      }

      if (this.onDataReceived) {
        this.onDataReceived(event.data, peerId);
      }
    };

    dataChannel.onerror = (error) => {
      // Check if this is a user-initiated disconnect (not a real error)
      // The error parameter is an Event object, not an Error object
      const errorTarget = error.target as RTCDataChannel;
      const isUserDisconnect = 
        errorTarget?.readyState === "closed" || 
        error.type === "error";

      if (isUserDisconnect) {
        this.log("info", "data_channel_closed_by_user", {
          peerId,
          error,
        });
      } else {
        this.log("error", "data_channel_error", { peerId, error });
      }
    };

    dataChannel.onclose = () => {
      logger.debug({
        event: "data_channel_closed",
        context: { peerId },
      });
      this.log("info", "data_channel_close_observed", { peerId });
    };
  }
  // Join a room. sendInitiatorOnline indicates whether to send "initiator online" message after joining.
  public async joinRoom(
    roomId: string,
    isInitiator: boolean,
    sendInitiatorOnline: boolean = false
  ): Promise<void> {
    // If already in the room, return directly
    if (this.isInRoom) {
      return;
    }
    this.isInitiator = isInitiator;
    if (!this.reconnectionInProgress) {
      this.onLifecycleEvent?.({
        type: "join_started",
        roomId,
        isInitiator: this.isInitiator,
      });
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false; // Prevent multiple resolve/reject

      // Helper to cleanup listeners and timer
      const cleanup = (
        joinResponseHandler?: (response: JoinRoomResponse) => void,
        eqHandlers?: Array<{ event: string; handler: (...args: any[]) => void }>
      ) => {
        clearTimeout(timeout);
        if (joinResponseHandler) {
          this.socket.off("joinResponse", joinResponseHandler);
        } else {
          // Safety off in case we didn't hold reference
          this.socket.off("joinResponse");
        }
        eqHandlers?.forEach(({ event, handler }) => this.socket.off(event, handler));
      };

      // Set timeout (15 seconds) for challenging networks/polling fallback
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup(joinResponseHandler, eqHandlers);
        this.isInRoom = false;
        this.roomId = null;
        if (!this.reconnectionInProgress) {
          this.onLifecycleEvent?.({
            type: "join_failed",
            roomId,
            isInitiator: this.isInitiator,
            error: "Join room timeout",
          });
        }
        reject(new Error("Join room timeout"));
      }, 15000);

      // Equivalent success resolver
      const resolveAsJoined = (reason: string) => {
        if (settled) return;
        settled = true;
        this.roomId = roomId;
        this.isInRoom = true;
        this.lastJoinedSocketId = this.socket.id ?? null;
        if (sendInitiatorOnline) {
          this.socket.emit("initiator-online", {
            roomId: this.roomId,
          });
        }
        logger.debug({
          event: "join_completed_early",
          context: {
            peerId: this.socket.id,
            reason,
            roomId,
            isInitiator: this.isInitiator,
          },
        });
        cleanup(joinResponseHandler, eqHandlers);
        if (!this.reconnectionInProgress) {
          this.onLifecycleEvent?.({
            type: "join_succeeded",
            roomId,
            isInitiator: this.isInitiator,
          });
        }
        resolve();
      };

      // Attach equivalent success listeners during join in-progress
      const eqHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = [];
      if (isInitiator) {
        const onReady = (_payload: any) => resolveAsJoined("ready");
        const onRecipientReady = (_payload: any) => resolveAsJoined("recipient-ready");
        this.socket.on("ready", onReady);
        this.socket.on("recipient-ready", onRecipientReady);
        eqHandlers.push({ event: "ready", handler: onReady });
        eqHandlers.push({ event: "recipient-ready", handler: onRecipientReady });
      } else {
        const onOffer = (_payload: any) => resolveAsJoined("offer");
        this.socket.on("offer", onOffer);
        eqHandlers.push({ event: "offer", handler: onOffer });
      }

      // Listen for join room response -- once
      const joinResponseHandler = (response: JoinRoomResponse) => {
        if (settled) return; // Already resolved via equivalent signal
        settled = true;
        cleanup(undefined, eqHandlers);

        if (response.success) {
          this.roomId = roomId;
          this.isInRoom = true;
          // Record the socket.id used for this successful join
          this.lastJoinedSocketId = this.socket.id ?? null;
          if (sendInitiatorOnline) {
            this.socket.emit("initiator-online", {
              roomId: this.roomId,
            });
          }
          logger.debug({
            event: "join_room_succeeded",
            context: {
              peerId: this.socket.id,
              roomId: response.roomId,
              isInitiator: this.isInitiator,
              isInRoom: this.isInRoom,
            },
          });
          resolve();
        } else {
          this.isInRoom = false;
          this.roomId = null;
          logger.warn({
            event: "join_room_failed",
            context: { roomId, message: response.message },
          });
          if (!this.reconnectionInProgress) {
            this.onLifecycleEvent?.({
              type: "join_failed",
              roomId,
              isInitiator: this.isInitiator,
              error: response.message,
            });
          }
          this.fireError("Failed to join room", { message: response.message });
          reject(new Error(response.message));
        }
      };
      this.socket.once("joinResponse", joinResponseHandler);

      // Send join room request
      try {
        this.socket.emit("join", { roomId });
      } catch (error) {
        if (!settled) {
          settled = true;
          cleanup(joinResponseHandler, eqHandlers);
          this.isInRoom = false;
          this.roomId = null;
          if (!this.reconnectionInProgress) {
            this.onLifecycleEvent?.({
              type: "join_failed",
              roomId,
              isInitiator: this.isInitiator,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          reject(error);
        }
      }
    });
  }
  // If peerId is specified, send to a specific recipient, otherwise broadcast
  public sendData(data: any, peerId: string): Promise<SendResult>;
  public sendData(
    data: any,
    peerId?: string | null
  ): Promise<BroadcastResult>;
  public async sendData(
    data: any,
    peerId?: string | null
  ): Promise<SendResult | BroadcastResult> {
    if (peerId) {
      return this.sendToPeer(data, peerId);
    }

    const results = await mapPeerCollection(
      this.dataChannels,
      (currentPeerId) => this.sendToPeer(data, currentPeerId)
    );

    return buildBroadcastResult(results);
  }
  // Send to a specific peer
  public async sendToPeer(data: any, peerId: string): Promise<SendResult> {
    return sendToPeerWithRetry({
      peerId,
      isGracefullyDisconnected: () =>
        this.gracefullyDisconnectedPeers.has(peerId),
      trySend: (attemptNumber) => this.trySendToPeer(data, peerId, attemptNumber),
      getFinalState: () => this.getDataChannelState(peerId),
      delay: (ms) => this.delay(ms),
      onChannelNotReady: () => {
        logger.warn({
          event: "data_channel_not_ready",
          context: {
            peerId,
            state: this.getDataChannelState(peerId) || "undefined",
          },
        });
        this.log("warn", "data_channel_retry_scheduled", { peerId });
      },
      onRetry: (attemptNumber, maxRetryAttempts) => {
        this.log(
          "info",
          "send_retry_started",
          {
            peerId,
            attempt: attemptNumber - 1,
            maxRetryAttempts,
          }
        );
      },
      onFailure: (failureResult) => {
        this.fireError(
          `Failed to send data to peer ${peerId} after maximum retries`,
          {
            peerId,
            attempts: failureResult.attempts,
            finalState: failureResult.finalState,
          }
        );
      },
    });
  }

  /**
   * Mark a peer as gracefully disconnected to prevent unnecessary retries
   */
  public markPeerGracefullyDisconnected(peerId: string): void {
    this.gracefullyDisconnectedPeers.add(peerId);
    this.log("info", "peer_marked_gracefully_disconnected", { peerId });
  }

  protected async closeDataChannel(peerId: string): Promise<void> {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }
  }

  protected async cleanupExistingConnection(peerId: string): Promise<void> {
    this.closeDataChannel(peerId);

    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
    }

    this.iceCandidatesQueue.delete(peerId);
  }

  public async cleanUpBeforeExit() {
    await cleanupPeerCollection(this.peerConnections, (peerId) =>
      this.cleanupExistingConnection(peerId)
    );
    if (this.socket) {
      this.socket.disconnect();
    }
    this.isInRoom = false;
  }

  // Public method to leave room and cleanup connections while keeping socket alive
  public async leaveRoomAndCleanup(): Promise<void> {
    const previousRoomId = this.roomId;
    this.onLifecycleEvent?.({
      type: "leave_started",
      roomId: previousRoomId,
      isInitiator: this.isInitiator,
    });
    // Clean up all peer connections
    await cleanupPeerCollection(this.peerConnections, (peerId) =>
      this.cleanupExistingConnection(peerId)
    );

    // Reset room-related state but keep socket connected
    this.isInRoom = false;
    this.roomId = null;
    this.isInitiator = false;
    this.isPeerDisconnected = false;
    this.isSocketDisconnected = false;
    this.reconnectionInProgress = false;
    this.gracefullyDisconnectedPeers.clear(); // Clear graceful disconnect tracking

    this.log(
      "info",
      "left_room_and_cleaned_connections"
    );
    this.onLifecycleEvent?.({
      type: "leave_completed",
      roomId: previousRoomId,
      isInitiator: this.isInitiator,
    });
  }
  // Abstract method declaration
  protected createDataChannel(_peerId: string) {
    throw new Error("createDataChannel must be implemented by subclass");
  }

  private trySendToPeer(
    data: any,
    peerId: string,
    attempts: number
  ): SendResult | null {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel?.readyState !== "open") {
      return null;
    }

    try {
      dataChannel.send(data);
      return buildSendResult(true, peerId, attempts, dataChannel.readyState);
    } catch (error) {
      logger.error({
        event: "send_to_peer_failed",
        context: { peerId, attempts, error },
      });
      this.log("error", "send_to_peer_error", { peerId, error });
      return buildSendResult(
        false,
        peerId,
        attempts,
        dataChannel.readyState,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private getDataChannelState(
    peerId: string
  ): RTCDataChannelState | "missing" {
    return this.dataChannels.get(peerId)?.readyState ?? "missing";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
