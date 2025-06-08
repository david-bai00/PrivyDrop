// BaseWebRTC.js
import io, { Socket, ManagerOptions, SocketOptions } from "socket.io-client";
import { getIceServers, getSocketOptions } from "@/app/config/environment";
import { WakeLockManager } from "./wakeLockManager";
import { postLogInDebug } from "@/app/config/api";
const developmentEnv = process.env.NEXT_PUBLIC_development!; //开发环境

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
  onError?: (error: WebRTCError) => void;
}

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  socketOptions: Partial<ManagerOptions & SocketOptions>;
  signalingServer: string; // signalingServer: 信令服务器的URL，用于初始化Socket.IO连接。
}

export default class BaseWebRTC {
  //类型申明
  protected iceServers: RTCIceServer[];
  protected socket: Socket;
  public peerConnections: Map<string, RTCPeerConnection>;
  public dataChannels: Map<string, RTCDataChannel>;

  public onDataChannelOpen: CallbackTypes["onDataChannelOpen"] | null;
  public onDataReceived: CallbackTypes["onDataReceived"] | null;
  protected onConnectionEstablished:
    | CallbackTypes["onConnectionEstablished"]
    | null;
  public onConnectionStateChange:
    | CallbackTypes["onConnectionStateChange"]
    | null;
  public onError: CallbackTypes["onError"] | null;

  protected iceCandidatesQueue: Map<string, RTCIceCandidateInit[]>;
  protected roomId: string | null;
  protected peerId: string | undefined | null;
  public isInRoom: boolean;
  protected isInitiator: boolean; //标记发起方
  //重连相关
  protected isSocketDisconnected: boolean; //跟踪 socket 连接状态
  protected isPeerDisconnected: boolean; //跟踪 P2P 连接状态
  protected reconnectionInProgress: boolean; //防止重复重连
  protected wakeLockManager: WakeLockManager;

  constructor(config: WebRTCConfig) {
    this.iceServers = config.iceServers;
    this.socket = io(config.signalingServer, config.socketOptions);
    this.peerConnections = new Map(); // Map<targetPeerId, RTCPeerConnection>
    this.dataChannels = new Map(); // Map<targetPeerId, RTCDataChannel>

    // Callbacks
    this.onDataChannelOpen = null; //当数据通道建立时的回调
    this.onDataReceived = null; //接收数据--响应
    this.onConnectionEstablished = null; //当WebRTC连接建立时触发。
    this.onConnectionStateChange = null; //监控和响应连接状态的变化
    this.onError = null;

    this.iceCandidatesQueue = new Map(); // 为每个peer存储ice候选项
    this.roomId = null;
    this.peerId = null; //自己的 ID
    this.isInRoom = false; //是否已经加入过房间
    this.setupCommonSocketListeners();

    this.isInitiator = false;

    this.isSocketDisconnected = false;
    this.isPeerDisconnected = false;
    this.reconnectionInProgress = false;
    this.wakeLockManager = new WakeLockManager();
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

  protected fireError(message: string, context?: Record<string, any>) {
    const error = new WebRTCError(message, context);
    this.log("error", message, context);
    this.onError?.(error);
  }
  // endregion
  // 设置信令服务器的事件监听器，用于处理各种信令消息（连接、ICE候选者、offer、answer等）。
  setupCommonSocketListeners() {
    this.socket.on("connect", () => {
      this.peerId = this.socket.id; //保存自己的 ID
      this.log("log", `Connected to signaling server, peerId: ${this.peerId}`);
    });

    this.socket.on("error", (error) => {
      this.fireError("Socket error", { error });
    });

    this.socket.on("ice-candidate", ({ candidate, peerId, from }) => {
      //接受方 peerId
      // console.log(`Received ICE candidate from ${from} for ${peerId}`);
      this.handleIceCandidate({ candidate, peerId, from });
    });
    // 添加 socket 断开连接的监听
    this.socket.on("disconnect", () => {
      this.isInRoom = false;
      this.isSocketDisconnected = true;
      if (developmentEnv === "true")
        postLogInDebug(
          `${this.peerId} disconnect on socket,isInitiator:${this.isInitiator},isInRoom:${this.isInRoom}`
        );
      // 尝试重连.//移动端切换到后台之后，P2P连接和socket连接都会断开.在切回来时，才会执行断开的代码，直接在这里重连;发送重连开始新号
      this.attemptReconnection();
    });
  }
  protected async attemptReconnection(): Promise<void> {
    if (this.reconnectionInProgress) return;

    if (this.isSocketDisconnected && this.isPeerDisconnected && this.roomId) {
      //等socket和P2P连接都断开之后再开始重连
      this.reconnectionInProgress = true;
      if (developmentEnv === "true") {
        postLogInDebug(
          `Starting reconnection, socket and peer both disconnected. isInitiator:${this.isInitiator}`
        );
      }

      try {
        const sendInitiatorOnline = this.isInitiator;
        await this.joinRoom(this.roomId, this.isInitiator, sendInitiatorOnline);

        // 重置状态
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
      // 只有在远程描述设置完成且连接未关闭的情况下才添加ICE候选项
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
      // 如果添加失败，也将其加入队列
      if (!this.iceCandidatesQueue.has(from)) {
        this.iceCandidatesQueue.set(from, []);
      }
      this.iceCandidatesQueue.get(from)?.push(candidate);
    }
  }

  protected async addQueuedIceCandidates(peerId: string): Promise<void> {
    const candidates = this.iceCandidatesQueue.get(peerId);
    const peerConnection = this.peerConnections.get(peerId);

    // this.log('log',`Attempting to add ${candidates?.length || 0} queued candidates for ${peerId}`);
    // this.log('log',`Connection state: ${peerConnection?.connectionState}`);
    // this.log('log',`Signaling state: ${peerConnection?.signalingState}`);

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
      // 只有在成功添加所有候选项后才清空队列
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
    // WebRTC默认提供了强大的加密功能，上线后要改为https协议
    const newPeerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    // // 增加更详细的连接状态监控
    // newPeerConnection.oniceconnectionstatechange = () => {
    //   this.log('log',`ICE Connection State (${peerId}):`, newPeerConnection.iceConnectionState);
    // };

    // newPeerConnection.onsignalingstatechange = () => {
    //   this.log('log',`Signaling State (${peerId}):`, newPeerConnection.signalingState);
    // };

    newPeerConnection.onconnectionstatechange = () => {
      // const state = newPeerConnection.connectionState;
      // this.log('log',`Connection State (${peerId}):`, state);
      this.handleConnectionStateChange(peerId, newPeerConnection);
    };
    // 改进ICE候选项处理
    newPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // this.log('log',`Sending ICE candidate to ${peerId}:`, event.candidate);
        this.socket.emit("ice-candidate", {
          candidate: event.candidate,
          peerId: peerId,
          from: this.socket.id, // 添加发送方ID
        });
      }
    };

    // // 添加ICE收集状态监控
    // newPeerConnection.onicegatheringstatechange = () => {
    //   this.log('log',`ICE Gathering State (${peerId}):`, newPeerConnection.iceGatheringState);
    // };

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
        // 在连接建立时请求 wake lock
        await this.wakeLockManager.requestWakeLock();
      },
      disconnected: async () => {
        await this.cleanupExistingConnection(peerId);
        this.isPeerDisconnected = true;
        if (developmentEnv === "true")
          postLogInDebug(`p2p disconnected, isInitiator:${this.isInitiator}`);
        // 尝试重连
        this.attemptReconnection();
        await this.wakeLockManager.releaseWakeLock();
      },
      failed: async () => {
        this.cleanupExistingConnection(peerId);
        this.isPeerDisconnected = true;
        await this.wakeLockManager.releaseWakeLock();
      },
      closed: async () => {
        this.cleanupExistingConnection(peerId);
        this.isPeerDisconnected = true;
        await this.wakeLockManager.releaseWakeLock();
      },
      // 以下必须添加，防止报错
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
      this.onDataReceived?.(event.data, peerId);
    };
  }
  // 加入房间,sendInitiatorOnline表示加入房间之后，是否要发送“发起方重新在线”消息
  public async joinRoom(
    roomId: string,
    isInitiator: boolean,
    sendInitiatorOnline: boolean = false
  ): Promise<void> {
    // 如果已经在房间里，直接返回
    if (this.isInRoom) {
      return;
    }
    this.isInitiator = isInitiator;
    return new Promise<void>((resolve, reject) => {
      // 设置超时时间（5秒）
      const timeout = setTimeout(() => {
        this.socket.off("joinResponse");
        reject(new Error("Join room timeout"));
        this.isInRoom = false;
        this.roomId = null;
      }, 5000);

      // 监听加入房间响应--一次
      this.socket.once("joinResponse", (response: JoinRoomResponse) => {
        clearTimeout(timeout); // 清除超时定时器

        if (response.success) {
          this.roomId = roomId;
          this.isInRoom = true;
          if (sendInitiatorOnline) {
            this.socket.emit("initiator-online", {
              roomId: this.roomId,
            });
          }
          if (developmentEnv === "true")
            postLogInDebug(
              `peerId:${this.socket.id} Successfully joined room: ${response.roomId},isInitiator:${this.isInitiator},isInRoom:${this.isInRoom}`
            );
          resolve();
        } else {
          this.isInRoom = false;
          this.roomId = null;
          if (developmentEnv === "true")
            postLogInDebug(`Failed to join room,message:${response.message}`);
          this.fireError("Failed to join room", { message: response.message });
          reject(new Error(response.message));
        }
      });

      // 发送加入房间请求
      try {
        this.socket.emit("join", { roomId });
      } catch (error) {
        clearTimeout(timeout);
        this.isInRoom = false;
        this.roomId = null;
        reject(error);
      }
    });
  }
  //如果指定peerId，则发送给特定接收方，否则广播
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
  //发送给特定对象
  protected sendToPeer(data: any, peerId: string): boolean {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel?.readyState === "open") {
      dataChannel.send(data);
      return true;
    }

    this.log("warn", `Data channel not ready for peer ${peerId}. Retrying...`);
    this.retryDataSend(data, peerId);
    return false;
  }

  protected retryDataSend(data: any, peerId: string): void {
    const maxRetries = 5;
    let retryCount = 0;

    const attemptSend = () => {
      const dataChannel = this.dataChannels.get(peerId);
      if (dataChannel?.readyState === "open") {
        dataChannel.send(data);
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
  // 抽象方法声明
  protected createDataChannel(peerId: string) {
    throw new Error("createDataChannel must be implemented by subclass");
  }
}
