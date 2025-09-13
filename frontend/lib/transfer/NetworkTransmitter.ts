import { EmbeddedChunkMeta } from "@/types/webrtc";
import { StateManager } from "./StateManager";
import WebRTC_Initiator from "../webrtc_Initiator";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NODE_ENV;
/**
 * 🚀 Network transmitter - Simplified version
 * Uses WebRTC native bufferedAmountLowThreshold for backpressure control
 */
export class NetworkTransmitter {
  constructor(
    private webrtcConnection: WebRTC_Initiator,
    private stateManager: StateManager
  ) {}

  /**
   * 🎯 Send embedded chunk packet with sequence number
   */
  async sendEmbeddedChunk(
    chunkData: ArrayBuffer,
    metadata: EmbeddedChunkMeta,
    peerId: string
  ): Promise<boolean> {
    try {
      // 1. Build fused data packet
      const embeddedPacket = this.createEmbeddedChunkPacket(
        chunkData,
        metadata
      );

      // 2. Send complete fused data packet (no fragmentation)
      await this.sendSingleData(embeddedPacket, peerId);

      // Key node logs (development environment only)

      if (
        developmentEnv === "development" &&
        (metadata.chunkIndex % 100 === 0 || metadata.isLastChunk)
      ) {
        postLogToBackend(
          `[DEBUG] ✓ CHUNK #${metadata.chunkIndex}/${
            metadata.totalChunks
          } sent, size: ${(chunkData.byteLength / 1024).toFixed(
            1
          )}KB, isLast: ${metadata.isLastChunk}`
        );
      }

      return true;
    } catch (error) {
      if (developmentEnv === "development") {
        postLogToBackend(
          `[DEBUG] ❌ CHUNK #${metadata.chunkIndex} send failed: ${error}`
        );
      }
      return false;
    }
  }

  /**
   * 🚀 Build data packet with embedded metadata
   */
  private createEmbeddedChunkPacket(
    chunkData: ArrayBuffer,
    chunkMeta: EmbeddedChunkMeta
  ): ArrayBuffer {
    // 1. Serialize metadata to JSON
    const metaJson = JSON.stringify(chunkMeta);
    const metaBytes = new TextEncoder().encode(metaJson);

    // 2. Metadata length (4 bytes)
    const metaLengthBuffer = new ArrayBuffer(4);
    const metaLengthView = new Uint32Array(metaLengthBuffer);
    metaLengthView[0] = metaBytes.length;

    // 3. Build final fused packet
    const totalLength = 4 + metaBytes.length + chunkData.byteLength;
    const finalPacket = new Uint8Array(totalLength);

    // Concatenate: [4-byte length] + [metadata] + [original chunk data]
    finalPacket.set(new Uint8Array(metaLengthBuffer), 0);
    finalPacket.set(metaBytes, 4);
    finalPacket.set(new Uint8Array(chunkData), 4 + metaBytes.length);

    return finalPacket.buffer;
  }

  /**
   * 🚀 Send single data packet (no fragmentation)
   */
  private async sendSingleData(
    data: string | ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    if (!dataChannel) {
      throw new Error("Data channel not found");
    }

    // Simplified backpressure control
    await this.simpleBufferControl(dataChannel, peerId);

    // Send directly, no fragmentation
    const sendResult = this.webrtcConnection.sendData(data, peerId);

    if (!sendResult) {
      const errorMessage = `sendData failed`;

      if (developmentEnv === "development") {
        postLogToBackend(`[DEBUG] ❌ ${errorMessage}`);
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * 🎯 Native backpressure control - Using WebRTC standard mechanism
   */
  private async simpleBufferControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<void> {
    const maxBuffer = 3 * 1024 * 1024; // 3MB maximum buffer
    const lowThreshold = 512 * 1024; // 512KB low threshold

    // Set native low threshold
    if (dataChannel.bufferedAmountLowThreshold !== lowThreshold) {
      dataChannel.bufferedAmountLowThreshold = lowThreshold;
    }

    // If buffer exceeds maximum, wait until it drops to low threshold
    if (dataChannel.bufferedAmount > maxBuffer) {
      const startTime = performance.now();
      const initialBuffered = dataChannel.bufferedAmount;

      await new Promise<void>((resolve) => {
        const onLow = () => {
          dataChannel.removeEventListener("bufferedamountlow", onLow);
          resolve();
        };
        dataChannel.addEventListener("bufferedamountlow", onLow);

        // Add timeout protection to avoid infinite waiting
        setTimeout(() => {
          dataChannel.removeEventListener("bufferedamountlow", onLow);
          resolve();
        }, 5000); // 5 second timeout
      });

      // Only output backpressure logs in development environment
      if (developmentEnv === "development") {
        const waitTime = performance.now() - startTime;
        postLogToBackend(
          `[DEBUG] 🚀 BACKPRESSURE - wait: ${waitTime.toFixed(
            1
          )}ms, buffered: ${(initialBuffered / 1024).toFixed(0)}KB -> ${(
            dataChannel.bufferedAmount / 1024
          ).toFixed(0)}KB`
        );
      }
    }
  }

  /**
   * 🚀 Send data with backpressure control
   */
  async sendWithBackpressure(
    data: string | ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    if (!dataChannel) {
      throw new Error("Data channel not found");
    }

    try {
      // For ArrayBuffer, if larger than 64KB, needs to be fragmented (fix sendData failed)
      if (data instanceof ArrayBuffer) {
        await this.sendLargeArrayBuffer(data, peerId);
      } else {
        await this.sendSingleData(data, peerId);
      }
    } catch (error) {
      const errorMessage = `sendWithBackpressure failed: ${error}`;
      if (developmentEnv === "development") {
        postLogToBackend(`[DEBUG] ❌ ${errorMessage}`);
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * 🚀 Send large ArrayBuffer (fragmentation processing)
   */
  private async sendLargeArrayBuffer(
    data: ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const networkChunkSize = 65536; // 64KB
    const totalSize = data.byteLength;

    // If data is less than 64KB, send directly
    if (totalSize <= networkChunkSize) {
      await this.sendSingleData(data, peerId);
      return;
    }

    // Fragment large data for sending
    let offset = 0;
    let fragmentIndex = 0;

    while (offset < totalSize) {
      const chunkSize = Math.min(networkChunkSize, totalSize - offset);
      const chunk = data.slice(offset, offset + chunkSize);

      // Send fragment
      await this.sendSingleData(chunk, peerId);

      offset += chunkSize;
      fragmentIndex++;
    }
  }

  /**
   * 📊 Get transmission statistics
   */
  public getTransmissionStats(peerId: string) {
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);

    return {
      peerId,
      currentBufferedAmount: dataChannel?.bufferedAmount || 0,
      bufferedAmountLowThreshold: dataChannel?.bufferedAmountLowThreshold || 0,
      channelState: dataChannel?.readyState || "unknown",
    };
  }

  /**
   * 🧹 Clean up resources
   */
  public cleanup(): void {
    if (developmentEnv === "development") {
      postLogToBackend("[DEBUG] 🧹 NetworkTransmitter cleaned up");
    }
  }
}
