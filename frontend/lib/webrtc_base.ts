// BaseWebRTC.js
import io, { Socket, ManagerOptions, SocketOptions } from "socket.io-client";
import { WakeLockManager } from "./wakeLockManager";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NODE_ENV; // Development environment

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
}

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
    level: "log" | "warn" | "error",
    message: string,
    ...args: any[]
  ) {
    const prefix = `[${this.constructor.name}]`;
    console[level](prefix, message, ...args);
  }

  public fireError(message: string, context?: Record<string, any>) {
    const error = new WebRTCError(message, context);
    this.log("error", message, context);
    this.onError?.(error);
  }
  // endregion
  // Sets up event listeners for the signaling server to handle various signaling messages (connection, ICE candidates, offer, answer, etc.).
  setupCommonSocketListeners() {
    this.socket.on("connect", async () => {
      this.peerId = this.socket.id; // Save own ID
      this.isSocketDisconnected = false;
      this.log("log", `Connected to signaling server, peerId: ${this.peerId}`);

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
      if (developmentEnv === "development")
        postLogToBackend(
          `${this.peerId} disconnect on socket,isInitiator:${this.isInitiator},isInRoom:${this.isInRoom}`
        );
      // Attempt to reconnect. On mobile, switching to the background disconnects both P2P and socket connections.
      // The disconnect code executes upon returning, so reconnect directly here; send a new signal to start reconnection.
      this.attemptReconnection();
    });

    this.socket.on("peer-disconnected", ({ peerId }) => {
      this.log("log", `Peer ${peerId} has disconnected.`);
      this.onPeerDisconnected?.(peerId);
      // We can also clean up the connection here if needed
      this.cleanupExistingConnection(peerId);
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
      if (developmentEnv === "development") {
        postLogToBackend(
          `Starting reconnection. socketDisc:${this.isSocketDisconnected}, peerDisc:${this.isPeerDisconnected}, socketIdChanged:${socketIdChanged}, isInitiator:${this.isInitiator}`
        );
      }

      try {
        // Ensure joinRoom does not early-return
        if (socketIdChanged) this.isInRoom = false;
        const sendInitiatorOnline = this.isInitiator;
        await this.joinRoom(this.roomId, this.isInitiator, sendInitiatorOnline);

        // Reset states
        this.isSocketDisconnected = false;
        this.isPeerDisconnected = false;
      } catch (error) {
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
        `Connection not ready for ${peerId}, keeping candidates queued`
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
        if (developmentEnv === "development")
          postLogToBackend(`p2p disconnected, isInitiator:${this.isInitiator}`);
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
        this.log("log", "Peer is connecting");
      },
      new: () => {
        this.log("log", "New connection state");
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
        this.log("log", `Data channel closed by user for peer ${peerId}`, {
          error,
        });
      } else {
        this.log("error", `Data channel error for peer ${peerId}`, { error });
      }
    };

    dataChannel.onclose = () => {
      if (developmentEnv === "development") {
        postLogToBackend(`DataChannel closed for peer: ${peerId}`);
      }
      this.log("log", `Data channel with ${peerId} closed.`);
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
        if (developmentEnv === "development")
          postLogToBackend(
            `peerId:${this.socket.id} Early-joined (${reason}) room:${roomId}, isInitiator:${this.isInitiator}`
          );
        cleanup(joinResponseHandler, eqHandlers);
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
          if (developmentEnv === "development")
            postLogToBackend(
              `peerId:${this.socket.id} Successfully joined room: ${response.roomId},isInitiator:${this.isInitiator},isInRoom:${this.isInRoom}`
            );
          resolve();
        } else {
          this.isInRoom = false;
          this.roomId = null;
          if (developmentEnv === "development")
            postLogToBackend(`Failed to join room,message:${response.message}`);
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
          reject(error);
        }
      }
    });
  }
  // If peerId is specified, send to a specific recipient, otherwise broadcast
  public sendData(data: any, peerId?: string | null): boolean {
    if (peerId) {
      return this.sendToPeer(data, peerId);
    } else {
      let success = true;
      for (const peerId of Object.keys(this.dataChannels)) {
        if (!this.sendToPeer(data, peerId)) {
          success = false;
        }
      }
      return success;
    }
  }
  // Send to a specific peer
  public sendToPeer(data: any, peerId: string): boolean {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel?.readyState === "open") {
      try {
        // Firefox compatibility debugging: Log sending details
        const _dataType =
          typeof data === "string"
            ? "string"
            : data instanceof ArrayBuffer
            ? "ArrayBuffer"
            : typeof data;
        const _dataSize =
          typeof data === "string"
            ? data.length
            : data instanceof ArrayBuffer
            ? data.byteLength
            : 0;

        // if (developmentEnv === "development")
        //   postLogToBackend(
        //     `sendToPeer - type: ${dataType}, size: ${dataSize}, bufferedAmount: ${dataChannel.bufferedAmount}`
        //   );

        dataChannel.send(data);
        return true;
      } catch (error) {
        postLogToBackend(`sendToPeer error: ${error}`);
        this.log("error", `Error sending data to peer ${peerId}`, { error });
        return false;
      }
    }

    postLogToBackend(
      `DataChannel not ready - peerId: ${peerId}, state: ${
        dataChannel?.readyState || "undefined"
      }`
    );
    this.log("warn", `Data channel not ready for peer ${peerId}. Retrying...`);
    return this.retryDataSend(data, peerId);
  }

  protected retryDataSend(data: any, peerId: string): boolean {
    // Check if peer has gracefully disconnected - no need to retry
    if (this.gracefullyDisconnectedPeers.has(peerId)) {
      this.log(
        "log",
        `Peer ${peerId} has gracefully disconnected, skipping retry`
      );
      return false;
    }

    const maxRetries = 5;
    let retryCount = 0;
    let ret = false;

    const attemptSend = () => {
      // Check again in case peer disconnected during retry
      if (this.gracefullyDisconnectedPeers.has(peerId)) {
        this.log(
          "log",
          `Peer ${peerId} gracefully disconnected during retry, stopping`
        );
        return;
      }

      const dataChannel = this.dataChannels.get(peerId);
      if (dataChannel?.readyState === "open") {
        dataChannel.send(data);
        ret = true;
      } else if (retryCount < maxRetries) {
        retryCount++;
        this.log(
          "log",
          `Retrying to send data to peer ${peerId}. Attempt ${retryCount} of ${maxRetries}`
        );
        setTimeout(attemptSend, 1000);
      } else {
        this.fireError(
          `Failed to send data to peer ${peerId} after maximum retries`
        );
      }
    };

    setTimeout(attemptSend, 100);
    return ret;
  }

  /**
   * Mark a peer as gracefully disconnected to prevent unnecessary retries
   */
  public markPeerGracefullyDisconnected(peerId: string): void {
    this.gracefullyDisconnectedPeers.add(peerId);
    this.log("log", `Marked peer ${peerId} as gracefully disconnected`);
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
    for (const peerId of Object.keys(this.peerConnections)) {
      this.cleanupExistingConnection(peerId);
    }
    if (this.socket) {
      this.socket.disconnect();
    }
    this.isInRoom = false;
  }

  // Public method to leave room and cleanup connections while keeping socket alive
  public async leaveRoomAndCleanup(): Promise<void> {
    // Clean up all peer connections
    for (const peerId of Array.from(this.peerConnections.keys())) {
      await this.cleanupExistingConnection(peerId);
    }

    // Reset room-related state but keep socket connected
    this.isInRoom = false;
    this.roomId = null;
    this.isInitiator = false;
    this.isPeerDisconnected = false;
    this.isSocketDisconnected = false;
    this.reconnectionInProgress = false;
    this.gracefullyDisconnectedPeers.clear(); // Clear graceful disconnect tracking

    this.log(
      "log",
      "Left room and cleaned up connections, socket remains connected"
    );
  }
  // Abstract method declaration
  protected createDataChannel(_peerId: string) {
    throw new Error("createDataChannel must be implemented by subclass");
  }
}
