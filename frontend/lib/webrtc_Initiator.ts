// 发起方 流程: 加入房间; 收到 'ready' 事件（新的接收方进入后socker server就会触发这个事件） -> createPeerConnection + createDataChannel -> createAndSendOffer
import BaseWebRTC, { WebRTCConfig } from "./webrtc_base";
import { postLogInDebug } from "@/app/config/api";
const developmentEnv = process.env.NEXT_PUBLIC_development!; //开发环境

export default class WebRTC_Initiator extends BaseWebRTC {
  constructor(config: WebRTCConfig) {
    super(config);
    this.setupInitiatorSocketListeners();
  }

  private setupInitiatorSocketListeners() {
    this.socket.on("ready", ({ peerId }) => {
      //新进入房间的 接收方 peerId
      this.handleReady({ peerId });
    });
    // 添加接收方响应的监听
    this.socket.on("recipient-ready", ({ peerId }) => {
      if (developmentEnv === "true")
        postLogInDebug(`[Initiator] Received recipient-ready from: ${peerId}`);
      this.handleReady({ peerId });
    });
    // 添加answer处理监听器
    this.socket.on("answer", ({ answer, peerId, from }) => {
      this.handleAnswer({ answer, peerId, from });
    });
  }

  //发送方收到接收方加入时创建连接
  private async handleReady({ peerId }: { peerId: string }): Promise<void> {
    //接收方 peerId
    // this.log('log',`Received ready signal from peer ${peerId}`);
    if (developmentEnv === "true")
      postLogInDebug(`Received ready signal from peer ${peerId}`);
    await this.createPeerConnection(peerId);
    await this.createDataChannel(peerId);
    await this.createAndSendOffer(peerId);
  }
  private async handleAnswer({
    answer,
    peerId,
    from,
  }: {
    answer: RTCSessionDescriptionInit;
    peerId: string;
    from: string;
  }): Promise<void> {
    // this.log('log',`Handling answer from peer ${from}`);
    if (developmentEnv === "true")
      postLogInDebug(`Handling answer from peer ${from}`);
    const peerConnection = this.peerConnections.get(from);
    if (!peerConnection) {
      this.fireError(`No peer connection found for peer ${from}`, { from });
      return;
    }

    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      // this.log('log', `Remote description set for peer ${from}`);

      // 在设置远程描述后处理队列中的ICE候选
      await this.addQueuedIceCandidates(from);
    } catch (error) {
      this.fireError("Error handling answer", { error, from });
    }
  }
  protected async createDataChannel(peerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      this.fireError(`No peer connection found for peer ${peerId}`, { peerId });
      return;
    }
    try {
      const dataChannel = peerConnection.createDataChannel("dataChannel", {
        ordered: true,
        // reliable: true
      });
      // this.log('log', `Created data channel for peer ${peerId}`);

      dataChannel.bufferedAmountLowThreshold = 262144; //256 KB -- 可以根据需要调整
      this.setupDataChannel(dataChannel, peerId);
      this.dataChannels.set(peerId, dataChannel);
    } catch (error) {
      this.fireError(`Error creating data channel for peer ${peerId}`, {
        error,
        peerId,
      });
    }
  }
  // 如果是发起方，创建并发送offer给信令服务器，以便与接收方协商建立连接。
  private async createAndSendOffer(peerId: string): Promise<void> {
    // this.log('log', `Creating and sending offer to ${peerId}`);
    if (developmentEnv === "true")
      postLogInDebug(`createAndSendOffer for peerId: ${peerId}`);
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      this.fireError(`No peer connection found for peer ${peerId}`, { peerId });
      return;
    }

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      // this.log('log','createAndSendOffer',peerId,this.roomId,offer);
      this.socket.emit("offer", {
        roomId: this.roomId,
        peerId: peerId,
        offer: offer,
        from: this.socket.id,
      });
    } catch (error) {
      this.fireError("Error creating and sending offer", { error, peerId });
    }
  }
}
