import { generateFileId } from "@/lib/fileUtils";
import {
  CustomFile,
  fileMetadata,
  WebRTCMessage,
  FileRequest,
  EmbeddedChunkMeta,
} from "@/types/webrtc";
import { StateManager } from "./StateManager";
import { MessageHandler, MessageHandlerDelegate } from "./MessageHandler";
import { NetworkTransmitter } from "./NetworkTransmitter";
import { ProgressTracker, ProgressCallback } from "./ProgressTracker";
import { StreamingFileReader } from "./StreamingFileReader";
import { TransferConfig } from "./TransferConfig";
import WebRTC_Initiator from "../webrtc_Initiator";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NEXT_PUBLIC_development!;
/**
 * 🚀 文件传输编排器
 * 整合所有组件，提供统一的文件传输服务
 */
export class FileTransferOrchestrator implements MessageHandlerDelegate {
  private stateManager: StateManager;
  private messageHandler: MessageHandler;
  private networkTransmitter: NetworkTransmitter;
  private progressTracker: ProgressTracker;

  constructor(private webrtcConnection: WebRTC_Initiator) {
    // 初始化所有组件
    this.stateManager = new StateManager();
    this.networkTransmitter = new NetworkTransmitter(
      webrtcConnection,
      this.stateManager
    );
    this.progressTracker = new ProgressTracker(this.stateManager);
    this.messageHandler = new MessageHandler(this.stateManager, this);

    // 设置数据处理器
    this.setupDataHandler();

    this.log("log", "FileTransferOrchestrator initialized");
  }

  // ===== 公共API - 简化的接口 =====

  /**
   * 🎯 发送文件元数据
   */
  public sendFileMeta(files: CustomFile[], peerId?: string): void {
    // 记录属于文件夹的文件大小，用于进度计算
    files.forEach((file) => {
      if (file.folderName) {
        const fileId = generateFileId(file);
        this.stateManager.addFileToFolder(file.folderName, fileId, file.size);
      }
    });

    // 循环发送所有文件的元数据
    const peers = peerId
      ? [peerId]
      : Array.from(this.webrtcConnection.peerConnections.keys());

    peers.forEach((pId) => {
      files.forEach((file) => {
        const fileId = generateFileId(file);
        this.stateManager.addPendingFile(fileId, file);

        const fileMeta = this.getFileMeta(file);
        const metaDataString = JSON.stringify(fileMeta);

        const sendResult = this.webrtcConnection.sendData(metaDataString, pId);
        if (!sendResult) {
          this.fireError("Failed to send file metadata", {
            fileMeta,
            peerId: pId,
          });
        }
      });
    });
  }

  /**
   * 🎯 发送字符串内容
   */
  public async sendString(content: string, peerId: string): Promise<void> {
    const chunkSize = TransferConfig.FILE_CONFIG.CHUNK_SIZE;
    const chunks: string[] = [];

    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    // 首先发送元数据
    await this.networkTransmitter.sendWithBackpressure(
      JSON.stringify({
        type: "stringMetadata",
        length: content.length,
      }),
      peerId
    );

    // 逐块发送，使用背压控制
    for (let i = 0; i < chunks.length; i++) {
      const data = JSON.stringify({
        type: "string",
        chunk: chunks[i],
        index: i,
        total: chunks.length,
      });
      await this.networkTransmitter.sendWithBackpressure(data, peerId);
    }

    this.log(
      "log",
      `String sent successfully - length: ${content.length}, chunks: ${chunks.length}`,
      { peerId }
    );
  }

  /**
   * 🎯 设置进度回调
   */
  public setProgressCallback(callback: ProgressCallback, peerId: string): void {
    this.progressTracker.setProgressCallback(callback, peerId);
  }

  // ===== MessageHandlerDelegate 实现 =====

  /**
   * 📄 处理文件请求（来自MessageHandler的委托）
   */
  async handleFileRequest(request: FileRequest, peerId: string): Promise<void> {
    const file = this.stateManager.getPendingFile(request.fileId);
    const offset = request.offset || 0;

    if (!file) {
      this.fireError(`File not found for request`, {
        fileId: request.fileId,
        peerId,
      });
      return;
    }

    await this.sendSingleFile(file, peerId, offset);
  }

  /**
   * 📝 日志记录（来自MessageHandler的委托）
   */
  public log(
    level: "log" | "warn" | "error",
    message: string,
    context?: Record<string, any>
  ): void {
    const prefix = `[FileTransferOrchestrator]`;
    console[level](prefix, message, context || "");
  }

  // ===== 内部编排方法 =====

  /**
   * 🎯 发送单个文件
   */
  private async sendSingleFile(
    file: CustomFile,
    peerId: string,
    offset: number = 0
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.stateManager.getPeerState(peerId);

    if (peerState.isSending) {
      this.log("warn", `Already sending file to peer ${peerId}`, { fileId });
      return;
    }

    // 初始化发送状态
    this.stateManager.updatePeerState(peerId, {
      isSending: true,
      currentFolderName: file.folderName,
      readOffset: offset,
      bufferQueue: [],
      isReading: false,
    });

    // 初始化进度统计
    const currentSent = this.stateManager.getFileBytesSent(peerId, fileId);
    this.stateManager.updateFileBytesSent(peerId, fileId, offset - currentSent);

    try {
      await this.processSendQueue(file, peerId);
      await this.waitForTransferComplete(peerId);
    } catch (error: any) {
      this.fireError(`Error sending file ${file.name}: ${error.message}`, {
        fileId,
        peerId,
      });
      this.abortFileSend(fileId, peerId);
    }
  }

  /**
   * 🚀 处理发送队列 - 使用StreamingFileReader
   */
  private async processSendQueue(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.stateManager.getPeerState(peerId);
    const transferStartTime = performance.now();

    // 1. 初始化流式文件读取器
    const streamReader = new StreamingFileReader(
      file,
      peerState.readOffset || 0
    );

    if (developmentEnv === "true") {
      postLogToBackend(
        `[DEBUG] 🚀 Starting transfer - file: ${file.name}, size: ${(
          file.size /
          1024 /
          1024
        ).toFixed(1)}MB`
      );
    }

    try {
      let totalBytesSent = 0;
      let networkChunkIndex = 0;
      let totalReadTime = 0;
      let totalSendTime = 0;
      let totalProgressTime = 0;
      let lastProgressTime = performance.now();

      // 2. 流式处理：逐个获取64KB网络块并发送
      while (peerState.isSending) {
        // 获取下一个网络块
        const readStartTime = performance.now();
        const chunkInfo = await streamReader.getNextNetworkChunk();
        const readTime = performance.now() - readStartTime;
        totalReadTime += readTime;

        // 检查是否已完成
        if (chunkInfo.chunk === null) {
          break;
        }

        // 构建嵌入式元数据
        const embeddedMeta: EmbeddedChunkMeta = {
          chunkIndex: chunkInfo.chunkIndex,
          totalChunks: chunkInfo.totalChunks,
          chunkSize: chunkInfo.chunk.byteLength,
          isLastChunk: chunkInfo.isLastChunk,
          fileOffset: chunkInfo.fileOffset,
          fileId,
        };

        // 发送带嵌入元数据的网络块
        let sendSuccessful = false;
        const sendStartTime = performance.now();
        try {
          sendSuccessful = await this.networkTransmitter.sendEmbeddedChunk(
            chunkInfo.chunk,
            embeddedMeta,
            peerId
          );

          if (sendSuccessful) {
            totalBytesSent += chunkInfo.chunk.byteLength;
          }
        } catch (error) {
          this.log(
            "warn",
            `Chunk send failed #${chunkInfo.chunkIndex}: ${error}`
          );
          sendSuccessful = false;
        }
        const sendTime = performance.now() - sendStartTime;
        totalSendTime += sendTime;

        // 更新状态和进度
        if (sendSuccessful) {
          this.stateManager.updatePeerState(peerId, {
            readOffset: chunkInfo.fileOffset + chunkInfo.chunk.byteLength,
          });

          const progressStartTime = performance.now();
          await this.progressTracker.updateFileProgress(
            chunkInfo.chunk.byteLength,
            fileId,
            file.size,
            peerId,
            true
          );
          const progressTime = performance.now() - progressStartTime;
          totalProgressTime += progressTime;
        }

        networkChunkIndex++;

        // 检查是否为最后一块
        if (chunkInfo.isLastChunk) {
          break;
        }
      }

      if (developmentEnv === "true") {
        const totalTime = performance.now() - transferStartTime;
        const avgSpeedMBps = totalBytesSent / 1024 / 1024 / (totalTime / 1000);
        postLogToBackend(
          `[DEBUG] ✅ Transfer complete - file: ${file.name}, time: ${(
            totalTime / 1000
          ).toFixed(1)}s, speed: ${avgSpeedMBps.toFixed(
            1
          )}MB/s, chunks: ${networkChunkIndex}`
        );
      }
    } catch (error: any) {
      const errorMessage = `Streaming send error: ${error.message}`;
      if (developmentEnv === "true") {
        postLogToBackend(`[DEBUG] ❌ Transfer error: ${errorMessage}`);
      }
      this.fireError(errorMessage, {
        fileId,
        peerId,
        offset: peerState.readOffset,
      });
      throw error;
    } finally {
      // 清理资源
      streamReader.cleanup();
    }
  }

  /**
   * ⏳ 等待传输完成确认
   */
  private async waitForTransferComplete(peerId: string): Promise<void> {
    const peerState = this.stateManager.getPeerState(peerId);
    while (peerState?.isSending) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * 📋 获取文件元数据
   */
  private getFileMeta(file: CustomFile): fileMetadata {
    const fileId = generateFileId(file);
    return {
      type: "fileMeta",
      fileId,
      name: file.name,
      size: file.size,
      fileType: file.type,
      fullName: file.fullName,
      folderName: file.folderName,
    };
  }

  /**
   * ❌ 中止文件发送
   */
  private abortFileSend(fileId: string, peerId: string): void {
    this.log("warn", `Aborting file send for ${fileId} to ${peerId}`);
    this.stateManager.resetPeerState(peerId);
  }

  /**
   * 🔧 设置数据处理器
   */
  private setupDataHandler(): void {
    this.webrtcConnection.onDataReceived = (data, peerId) => {
      if (typeof data === "string") {
        try {
          const parsedData = JSON.parse(data) as WebRTCMessage;
          this.messageHandler.handleSignalingMessage(parsedData, peerId);
        } catch (error) {
          this.fireError("Error parsing received JSON data", { error, peerId });
        }
      }
    };
  }

  /**
   * 🔥 错误处理
   */
  private fireError(message: string, context?: Record<string, any>) {
    this.webrtcConnection.fireError(message, {
      ...context,
      component: "FileTransferOrchestrator",
    });
  }

  // ===== 状态查询和调试 =====

  /**
   * 📊 获取传输统计信息
   */
  public getTransferStats(peerId?: string) {
    const stats = {
      stateManager: this.stateManager.getStateStats(),
      progressTracker: peerId
        ? this.progressTracker.getProgressStats(peerId)
        : null,
      networkTransmitter: peerId
        ? this.networkTransmitter.getTransmissionStats(peerId)
        : null,
    };

    return stats;
  }

  /**
   * 🧹 清理所有资源
   */
  public cleanup(): void {
    this.stateManager.cleanup();
    this.networkTransmitter.cleanup();
    this.progressTracker.cleanup();
    this.messageHandler.cleanup();

    this.log("log", "FileTransferOrchestrator cleaned up");
  }
}
