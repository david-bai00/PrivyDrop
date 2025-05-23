// 接收方 流程: 加入房间; 收到 'offer' 事件 -> createPeerConnection + createDataChannel -> 发送 answer
import BaseWebRTC from './webrtc_base';
import { postLogInDebug } from '@/app/config/api';
const developmentEnv = process.env.NEXT_PUBLIC_development!;//开发环境

interface AnswerPayload {
  answer: RTCSessionDescriptionInit;
  peerId: string;
}
export default class WebRTC_Recipient extends BaseWebRTC {
  constructor(signalingServer: string) {
    super(signalingServer);
    this.setupRecipientSocketListeners();
  }

  private setupRecipientSocketListeners(): void {
    
    this.socket.on('offer', ({ peerId, offer, from }) => {
      this.handleOffer({ peerId,offer, from });
    });
    
    this.socket.on('answer', ({ answer, peerId }) => {
      this.handleAnswer({ answer, peerId });
    });

    // 添加发起方重新上线的监听
    this.socket.on('initiator-online', ({ roomId }) => {
      console.log(`[Recipient] Received initiator-online for room: ${roomId}`,this.roomId);
      // 发送准备就绪的响应
      console.log(`[Recipient] Sending recipient-ready, my peerId: ${this.socket.id}`,this.peerId);
      // 发送准备就绪的响应
      this.socket.emit('recipient-ready', {
        roomId: this.roomId,
        peerId: this.socket.id
      });
    });

  }
  // 接收方 收到 offer 时创建连接
  private async handleOffer({ peerId, offer, from }: { offer: RTCSessionDescriptionInit; peerId: string; from: string }): Promise<void> {
    console.log(`Handling offer from peer ${from}`);
    try {
      // 1. 清理已存在的连接
      await this.cleanupExistingConnection(from);
      // 2. 创建新的连接
      const peerConnection = await this.createPeerConnection(from);
      // 再创建数据通道
      await this.createDataChannel(from);

      // 4. 设置远程描述
      // console.log(`Setting remote description for peer ${from}`);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      // 创建并设置本地描述（answer）
      // console.log(`Creating answer for peer ${from}`);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      // 发送 answer
      console.log(`Sending answer to peer ${from}`);
      this.socket.emit('answer', {
        answer,
        peerId: from,
        from: this.socket.id
      });
      // 最后处理已缓存的 ICE candidates
      await this.addQueuedIceCandidates(from);

    } catch (error) {
      console.error('Error handling offer:', error);
      // 清理失败的连接
      await this.cleanupExistingConnection(from);
    }
  }

  private async handleAnswer({ answer, peerId }: AnswerPayload): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  protected async createDataChannel(peerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      console.error(`No peer connection found for peer ${peerId}`);
      return;
    }
    
    peerConnection.ondatachannel = (event) => {
      // console.log(`Received data channel from peer ${peerId}`);
      this.setupDataChannel(event.channel, peerId);
      this.dataChannels.set(peerId, event.channel);
    };
  }
}