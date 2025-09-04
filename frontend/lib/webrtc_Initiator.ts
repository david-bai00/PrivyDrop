// Initiator flow: Join room; receive 'ready' event (this event is triggered by the socket server after a new recipient enters) -> createPeerConnection + createDataChannel -> createAndSendOffer
import BaseWebRTC, { WebRTCConfig } from "./webrtc_base";
import { postLogToBackend } from "@/app/config/api";
import { detectBrowser, getDataChannelConfig, logBrowserCompatibility } from "./browserUtils";
const developmentEnv = process.env.NEXT_PUBLIC_development!; // Development environment

export default class WebRTC_Initiator extends BaseWebRTC {
  private browserInfo = detectBrowser();
  
  constructor(config: WebRTCConfig) {
    super(config);
    // 记录浏览器兼容性信息
    logBrowserCompatibility();
    this.setupInitiatorSocketListeners();
  }

  private setupInitiatorSocketListeners() {
    this.socket.on("ready", ({ peerId }) => {
      // The peerId of the new recipient who entered the room
      this.handleReady({ peerId });
    });
    // Add listener for recipient's response
    this.socket.on("recipient-ready", ({ peerId }) => {
      if (developmentEnv === "true")
        postLogToBackend(
          `[Initiator] Received recipient-ready from: ${peerId}`
        );
      this.handleReady({ peerId });
    });
    // Add answer handler listener
    this.socket.on("answer", ({ answer, peerId, from }) => {
      this.handleAnswer({ answer, peerId, from });
    });
  }

  // The sender creates a connection upon receiving the recipient's join
  private async handleReady({ peerId }: { peerId: string }): Promise<void> {
    // Recipient peerId
    // this.log('log',`Received ready signal from peer ${peerId}`);
    if (developmentEnv === "true")
      postLogToBackend(`Received ready signal from peer ${peerId}`);
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
      postLogToBackend(`Handling answer from peer ${from}`);
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

      // Process queued ICE candidates after setting the remote description
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
      // 使用浏览器特定的DataChannel配置
      const dataChannelConfig = getDataChannelConfig(this.browserInfo.name);
      
      postLogToBackend(
        `[Firefox Debug] Creating DataChannel with config - browser: ${this.browserInfo.name}, config: ${JSON.stringify(dataChannelConfig)}`
      );
      
      const dataChannel = peerConnection.createDataChannel("dataChannel", dataChannelConfig);
      
      // Firefox特定的缓冲区阈值优化
      if (this.browserInfo.isFirefox) {
        dataChannel.bufferedAmountLowThreshold = 131072; // 128KB for Firefox
        postLogToBackend(`[Firefox Debug] Set Firefox-specific bufferedAmountLowThreshold: 128KB`);
      } else {
        dataChannel.bufferedAmountLowThreshold = 262144; // 256KB for others
      }
      
      this.setupDataChannel(dataChannel, peerId);
      this.dataChannels.set(peerId, dataChannel);
      
      postLogToBackend(
        `[Firefox Debug] DataChannel created successfully - peer: ${peerId}, label: dataChannel, browser: ${this.browserInfo.name}`
      );
    } catch (error) {
      postLogToBackend(
        `[Firefox Debug] Error creating DataChannel - peer: ${peerId}, error: ${error}`
      );
      this.fireError(`Error creating data channel for peer ${peerId}`, {
        error,
        peerId,
      });
    }
  }
  // If it is the initiator, create and send an offer to the signaling server to negotiate a connection with the recipient.
  private async createAndSendOffer(peerId: string): Promise<void> {
    // this.log('log', `Creating and sending offer to ${peerId}`);
    if (developmentEnv === "true")
      postLogToBackend(`createAndSendOffer for peerId: ${peerId}`);
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
