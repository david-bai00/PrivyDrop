import { EmbeddedChunkMeta } from "@/types/webrtc";
import { StateManager } from "./StateManager";
import WebRTC_Initiator from "../webrtc_Initiator";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NEXT_PUBLIC_development!;
/**
 * 🚀 网络传输器 - 简化版
 * 使用WebRTC原生bufferedAmountLowThreshold进行背压控制
 */
export class NetworkTransmitter {
  constructor(
    private webrtcConnection: WebRTC_Initiator,
    private stateManager: StateManager
  ) {}

  /**
   * 🎯 发送带序号的融合数据包
   */
  async sendEmbeddedChunk(
    chunkData: ArrayBuffer,
    metadata: EmbeddedChunkMeta,
    peerId: string
  ): Promise<boolean> {
    try {
      // 1. 构建融合数据包
      const embeddedPacket = this.createEmbeddedChunkPacket(
        chunkData,
        metadata
      );

      // 2. 发送完整的融合数据包（不可分片）
      await this.sendSingleData(embeddedPacket, peerId);

      // 关键节点日志（仅开发环境）

      if (
        developmentEnv === "true" &&
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
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ❌ CHUNK #${metadata.chunkIndex} send failed: ${error}`
        );
      }
      return false;
    }
  }

  /**
   * 🚀 构建融合元数据的数据包
   */
  private createEmbeddedChunkPacket(
    chunkData: ArrayBuffer,
    chunkMeta: EmbeddedChunkMeta
  ): ArrayBuffer {
    // 1. 将元数据序列化为JSON
    const metaJson = JSON.stringify(chunkMeta);
    const metaBytes = new TextEncoder().encode(metaJson);

    // 2. 元数据长度（4字节）
    const metaLengthBuffer = new ArrayBuffer(4);
    const metaLengthView = new Uint32Array(metaLengthBuffer);
    metaLengthView[0] = metaBytes.length;

    // 3. 构建最终的融合数据包
    const totalLength = 4 + metaBytes.length + chunkData.byteLength;
    const finalPacket = new Uint8Array(totalLength);

    // 拼接: [4字节长度] + [元数据] + [原始chunk数据]
    finalPacket.set(new Uint8Array(metaLengthBuffer), 0);
    finalPacket.set(metaBytes, 4);
    finalPacket.set(new Uint8Array(chunkData), 4 + metaBytes.length);

    return finalPacket.buffer;
  }

  /**
   * 🚀 发送单个数据包（禁止分片）
   */
  private async sendSingleData(
    data: string | ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    if (!dataChannel) {
      throw new Error("Data channel not found");
    }

    // 简化背压控制
    await this.simpleBufferControl(dataChannel, peerId);

    // 直接发送，不分片
    const sendResult = this.webrtcConnection.sendData(data, peerId);

    if (!sendResult) {
      const errorMessage = `sendData failed`;

      if (developmentEnv === "true") {
        postLogToBackend(`[DEBUG] ❌ ${errorMessage}`);
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * 🎯 原生背压控制 - 使用WebRTC标准机制
   */
  private async simpleBufferControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<void> {
    const maxBuffer = 3 * 1024 * 1024; // 3MB最大缓冲
    const lowThreshold = 512 * 1024; // 512KB低阈值

    // 设置原生低阈值
    if (dataChannel.bufferedAmountLowThreshold !== lowThreshold) {
      dataChannel.bufferedAmountLowThreshold = lowThreshold;
    }

    // 如果缓冲区超过最大值，等待降到低阈值
    if (dataChannel.bufferedAmount > maxBuffer) {
      const startTime = performance.now();
      const initialBuffered = dataChannel.bufferedAmount;

      await new Promise<void>((resolve) => {
        const onLow = () => {
          dataChannel.removeEventListener("bufferedamountlow", onLow);
          resolve();
        };
        dataChannel.addEventListener("bufferedamountlow", onLow);

        // 添加超时保护，避免无限等待
        setTimeout(() => {
          dataChannel.removeEventListener("bufferedamountlow", onLow);
          resolve();
        }, 5000); // 5秒超时
      });

      // 仅在开发环境输出背压日志
      if (developmentEnv === "true") {
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
   * 🚀 发送带背压控制的数据
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
      // 对于ArrayBuffer，如果超过64KB，需要分片发送（修复sendData failed）
      if (data instanceof ArrayBuffer) {
        await this.sendLargeArrayBuffer(data, peerId);
      } else {
        await this.sendSingleData(data, peerId);
      }
    } catch (error) {
      const errorMessage = `sendWithBackpressure failed: ${error}`;
      if (developmentEnv === "true") {
        postLogToBackend(`[DEBUG] ❌ ${errorMessage}`);
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * 🚀 发送大型ArrayBuffer（分片处理）
   */
  private async sendLargeArrayBuffer(
    data: ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const networkChunkSize = 65536; // 64KB
    const totalSize = data.byteLength;

    // 如果数据小于64KB，直接发送
    if (totalSize <= networkChunkSize) {
      await this.sendSingleData(data, peerId);
      return;
    }

    // 大块数据分片发送
    let offset = 0;
    let fragmentIndex = 0;

    while (offset < totalSize) {
      const chunkSize = Math.min(networkChunkSize, totalSize - offset);
      const chunk = data.slice(offset, offset + chunkSize);

      // 发送分片
      await this.sendSingleData(chunk, peerId);

      offset += chunkSize;
      fragmentIndex++;
    }
  }

  /**
   * 📊 获取传输统计信息
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
   * 🧹 清理资源
   */
  public cleanup(): void {
    if (developmentEnv === "true") {
      postLogToBackend("[DEBUG] 🧹 NetworkTransmitter cleaned up");
    }
  }
}
