// Recipient flow: Join room; receive 'offer' event -> createPeerConnection + createDataChannel -> send answer
import BaseWebRTC, { WebRTCConfig } from "./webrtc_base";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NEXT_PUBLIC_development!; // Development environment

interface AnswerPayload {
  answer: RTCSessionDescriptionInit;
  peerId: string;
}
export default class WebRTC_Recipient extends BaseWebRTC {
  constructor(config: WebRTCConfig) {
    super(config);
    this.setupRecipientSocketListeners();
  }

  private setupRecipientSocketListeners(): void {
    this.socket.on("offer", ({ peerId, offer, from }) => {
      this.handleOffer({ peerId, offer, from });
    });

    this.socket.on("answer", ({ answer, peerId }) => {
      this.handleAnswer({ answer, peerId });
    });

    // Add listener for initiator re-online
    this.socket.on("initiator-online", ({ roomId }) => {
      this.log("log", `Received initiator-online for room: ${roomId}`);
      // Send a ready response
      this.log(
        "log",
        `Sending recipient-ready, my peerId: ${this.socket.id}`,
        this.peerId
      );
      // Send a ready response
      this.socket.emit("recipient-ready", {
        roomId: this.roomId,
        peerId: this.socket.id,
      });
    });
  }
  // Recipient creates a connection upon receiving an offer
  private async handleOffer({
    peerId,
    offer,
    from,
  }: {
    offer: RTCSessionDescriptionInit;
    peerId: string;
    from: string;
  }): Promise<void> {
    this.log("log", `Handling offer from peer ${from}`);
    try {
      // 1. Clean up existing connections
      await this.cleanupExistingConnection(from);
      // 2. Create a new connection
      const peerConnection = await this.createPeerConnection(from);
      // Then create a data channel
      await this.createDataChannel(from);

      // 4. Set the remote description
      // console.log(`Setting remote description for peer ${from}`);
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      // Create and set the local description (answer)
      // console.log(`Creating answer for peer ${from}`);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      // Send the answer
      this.log("log", `Sending answer to peer ${from}`);
      this.socket.emit("answer", {
        answer,
        peerId: from,
        from: this.socket.id,
      });
      // Finally, process the cached ICE candidates
      await this.addQueuedIceCandidates(from);
    } catch (error) {
      this.fireError("Error handling offer", { error, from });
      // Clean up the failed connection
      await this.cleanupExistingConnection(from);
    }
  }

  private async handleAnswer({ answer, peerId }: AnswerPayload): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      this.fireError("No peer connection for handleAnswer", { peerId });
      return;
    }

    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    } catch (error) {
      this.fireError("Error handling answer", { error, peerId });
    }
  }

  protected async createDataChannel(peerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      this.fireError(`No peer connection found for peer ${peerId}`, { peerId });
      return;
    }

    peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId);
      this.dataChannels.set(peerId, event.channel);
    };
  }
}
