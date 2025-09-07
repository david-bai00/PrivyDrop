import { EmbeddedChunkMeta } from "@/types/webrtc";
import { StateManager } from "./StateManager";
import { TransferConfig } from "./TransferConfig";
import WebRTC_Initiator from "../webrtc_Initiator";
import { postLogToBackend } from "@/app/config/api";

/**
 * 🚀 发送策略枚举
 */
type SendStrategy = "AGGRESSIVE" | "NORMAL" | "CAUTIOUS" | "WAIT";

/**
 * 🚀 网络传输器
 * 负责所有WebRTC数据传输、背压控制、自适应性能调整
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
      const embeddedPacket = this.createEmbeddedChunkPacket(chunkData, metadata);

      // 2. 发送完整的融合数据包（不可分片）
      await this.sendSingleData(embeddedPacket, peerId);

      postLogToBackend(
        `[DEBUG] ✓ EMBEDDED chunk #${metadata.chunkIndex}/${metadata.totalChunks} sent - size: ${chunkData.byteLength}, packet: ${embeddedPacket.byteLength} bytes, isLast: ${metadata.isLastChunk}`
      );

      return true;
    } catch (error) {
      postLogToBackend(
        `[DEBUG] ❌ EMBEDDED chunk #${metadata.chunkIndex} send failed: ${error}`
      );
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

    postLogToBackend(
      `[DEBUG] 📦 EMBEDDED packet created - chunkIndex: ${chunkMeta.chunkIndex}, metaSize: ${metaBytes.length}, chunkSize: ${chunkData.byteLength}, totalSize: ${totalLength}`
    );

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

    // 调试信息
    const dataType = typeof data === "string" ? "string" : data instanceof ArrayBuffer ? "ArrayBuffer" : "unknown";
    const dataSize = typeof data === "string" ? data.length : data instanceof ArrayBuffer ? data.byteLength : 0;

    // 智能背压控制
    await this.smartBufferControl(dataChannel, peerId);

    // 直接发送，不分片
    const sendResult = this.webrtcConnection.sendData(data, peerId);

    if (!sendResult) {
      const errorMessage = `sendData failed for ${dataType} data of size ${dataSize}`;
      postLogToBackend(`[DEBUG] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    postLogToBackend(
      `[DEBUG] 📤 Data sent successfully - type: ${dataType}, size: ${dataSize}`
    );
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
      postLogToBackend(`[DEBUG] ${errorMessage}`);
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
    const networkChunkSize = TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE;
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
      postLogToBackend(
        `[DEBUG] 📦 Fragment sent #${fragmentIndex} - size: ${chunkSize}`
      );
      
      offset += chunkSize;
      fragmentIndex++;
    }
  }

  /**
   * 🎯 智能缓冲控制策略
   */
  private async smartBufferControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<void> {
    const strategy = await this.intelligentSendControl(dataChannel, peerId);

    switch (strategy) {
      case "AGGRESSIVE":
        // 积极模式：立即发送
        return;
      
      case "NORMAL":
        // 正常模式：轻微等待
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        return;
      
      case "CAUTIOUS":
        // 谨慎模式：短暂等待
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        return;
      
      case "WAIT":
        // 等待模式：主动轮询等待
        await this.activePollingWait(dataChannel, peerId);
        return;
    }
  }

  /**
   * 🎯 自适应智能发送控制策略
   */
  private async intelligentSendControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<SendStrategy> {
    const bufferedAmount = dataChannel.bufferedAmount;
    const adaptiveThreshold = this.stateManager.getAdaptiveThreshold(peerId);
    const utilizationRate = bufferedAmount / adaptiveThreshold;

    // 根据网络性能动态调整策略阈值
    const perf = this.stateManager.getNetworkPerformance(peerId);
    const networkQuality = this.getNetworkQuality(perf?.avgClearingRate || 0);

    let thresholds = TransferConfig.getAdaptiveThresholds(perf?.avgClearingRate || 0).strategy;

    if (utilizationRate < thresholds.aggressive) {
      return "AGGRESSIVE";
    } else if (utilizationRate < thresholds.normal) {
      return "NORMAL";
    } else if (utilizationRate < (thresholds.cautious || TransferConfig.SEND_STRATEGY_CONFIG.CAUTIOUS_THRESHOLD)) {
      return "CAUTIOUS";
    } else {
      return "WAIT";
    }
  }

  /**
   * 🔍 获取网络质量评级
   */
  private getNetworkQuality(avgClearingRate: number): "good" | "average" | "poor" {
    const config = TransferConfig.QUALITY_CONFIG;
    if (avgClearingRate > config.GOOD_NETWORK_SPEED) {
      return "good";
    } else if (avgClearingRate > config.AVERAGE_NETWORK_SPEED) {
      return "average";
    } else {
      return "poor";
    }
  }

  /**
   * 🔄 主动轮询等待（WAIT模式）
   */
  private async activePollingWait(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<void> {
    const config = TransferConfig.SEND_STRATEGY_CONFIG;
    const startTime = Date.now();
    const adaptiveThreshold = this.stateManager.getAdaptiveThreshold(peerId);
    const threshold_low = adaptiveThreshold * 0.3;
    const initialBuffered = dataChannel.bufferedAmount;
    let pollCount = 0;

    while (dataChannel.bufferedAmount > threshold_low) {
      pollCount++;

      if (Date.now() - startTime > config.MAX_WAIT_TIME) {
        postLogToBackend(
          `[DEBUG] ⚠️ Buffer wait timeout - buffered: ${dataChannel.bufferedAmount}, threshold: ${adaptiveThreshold}, waitTime: ${Date.now() - startTime}ms`
        );
        break;
      }

      await new Promise<void>((resolve) => 
        setTimeout(resolve, config.POLLING_INTERVAL)
      );
    }

    // 记录等待结束状态并更新网络性能
    const waitTime = Date.now() - startTime;
    const finalBuffered = dataChannel.bufferedAmount;
    const clearedBytes = initialBuffered - finalBuffered;
    const clearingRate = waitTime > 0 ? clearedBytes / 1024 / (waitTime / 1000) : 0;

    // 更新网络性能学习
    if (clearingRate > 0) {
      this.stateManager.updateNetworkPerformance(peerId, clearingRate, waitTime);
    }

    postLogToBackend(
      `[DEBUG] 📊 Wait completed - cleared: ${clearedBytes} bytes, rate: ${clearingRate.toFixed(2)} KB/s, time: ${waitTime}ms, polls: ${pollCount}`
    );
  }

  /**
   * 📊 获取传输统计信息
   */
  public getTransmissionStats(peerId: string) {
    const networkPerf = this.stateManager.getNetworkPerformance(peerId);
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    
    return {
      peerId,
      networkPerformance: networkPerf || null,
      currentBufferedAmount: dataChannel?.bufferedAmount || 0,
      adaptiveThreshold: this.stateManager.getAdaptiveThreshold(peerId),
      channelState: dataChannel?.readyState || 'unknown',
    };
  }

  /**
   * 🧹 清理资源
   */
  public cleanup(): void {
    // NetworkTransmitter本身没有需要清理的资源
    // 实际的清理工作由StateManager和WebRTC_Initiator处理
    postLogToBackend("[DEBUG] 🧹 NetworkTransmitter cleaned up");
  }
}
