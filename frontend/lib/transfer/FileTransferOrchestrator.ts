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
const developmentEnv = process.env.NODE_ENV;
/**
 * 🚀 File transfer orchestrator
 * Integrates all components to provide unified file transfer services
 */
export class FileTransferOrchestrator implements MessageHandlerDelegate {
  private stateManager: StateManager;
  private messageHandler: MessageHandler;
  private networkTransmitter: NetworkTransmitter;
  private progressTracker: ProgressTracker;

  constructor(private webrtcConnection: WebRTC_Initiator) {
    // Initialize all components
    this.stateManager = new StateManager();
    this.networkTransmitter = new NetworkTransmitter(
      webrtcConnection,
      this.stateManager
    );
    this.progressTracker = new ProgressTracker(this.stateManager);
    this.messageHandler = new MessageHandler(this.stateManager, this);

    // Set up data handler
    this.setupDataHandler();

    this.log("log", "FileTransferOrchestrator initialized");
  }
  /**
   * 🎯 Send file metadata
   */
  public sendFileMeta(files: CustomFile[], peerId?: string): void {
    // Record file sizes belonging to folders for progress calculation
    files.forEach((file) => {
      if (file.folderName) {
        const fileId = generateFileId(file);
        this.stateManager.addFileToFolder(file.folderName, fileId, file.size);
      }
    });

    // Loop to send metadata for all files
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
   * 🎯 Send string content
   */
  public async sendString(content: string, peerId: string): Promise<void> {
    const chunkSize = 65000;
    const chunks: string[] = [];

    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    // First send metadata
    await this.networkTransmitter.sendWithBackpressure(
      JSON.stringify({
        type: "stringMetadata",
        length: content.length,
      }),
      peerId
    );

    // Send chunks one by one using backpressure control
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
   * 🎯 Set progress callback
   */
  public setProgressCallback(callback: ProgressCallback, peerId: string): void {
    this.progressTracker.setProgressCallback(callback, peerId);
  }

  // ===== MessageHandlerDelegate Implementation =====

  /**
   * 📄 Handle file request (delegated from MessageHandler)
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
   * 📝 Logging (delegated from MessageHandler)
   */
  public log(
    level: "log" | "warn" | "error",
    message: string,
    context?: Record<string, any>
  ): void {
    const prefix = `[FileTransferOrchestrator]`;
    console[level](prefix, message, context || "");
  }

  // ===== Internal Orchestration Methods =====

  /**
   * 🎯 Send single file
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

    // Initialize sending state
    this.stateManager.updatePeerState(peerId, {
      isSending: true,
      currentFolderName: file.folderName,
      readOffset: offset,
      bufferQueue: [],
      isReading: false,
    });
    // Initialize progress statistics
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
   * 🚀 Process send queue - Using StreamingFileReader
   */
  private async processSendQueue(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.stateManager.getPeerState(peerId);
    const transferStartTime = performance.now();

    // 🔧 Fix: Record initial offset at the start of transmission, used for subsequent statistics calculation
    const initialReadOffset = peerState.readOffset || 0;

    // 1. Initialize streaming file reader
    const streamReader = new StreamingFileReader(file, initialReadOffset);

    if (developmentEnv === "development") {
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

      // 2. Stream processing: Get 64KB network chunks one by one and send
      while (peerState.isSending) {
        // Get next network chunk
        const readStartTime = performance.now();
        const chunkInfo = await streamReader.getNextNetworkChunk();
        const readTime = performance.now() - readStartTime;
        totalReadTime += readTime;

        // Check if completed
        if (chunkInfo.chunk === null) {
          break;
        }

        // Build embedded metadata
        const embeddedMeta: EmbeddedChunkMeta = {
          chunkIndex: chunkInfo.chunkIndex,
          totalChunks: chunkInfo.totalChunks,
          chunkSize: chunkInfo.chunk.byteLength,
          isLastChunk: chunkInfo.isLastChunk,
          fileOffset: chunkInfo.fileOffset,
          fileId,
        };

        // Send network chunk with embedded metadata
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

        // Update state and progress
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

        // Check if it's the last chunk
        if (chunkInfo.isLastChunk) {
          break;
        }
      }

      if (developmentEnv === "development") {
        const totalTime = performance.now() - transferStartTime;
        const avgSpeedMBps = totalBytesSent / 1024 / 1024 / (totalTime / 1000);

        // 🔧 Fix: Use correct initial offset instead of current readOffset for log statistics
        const initialOffset = initialReadOffset || 0; // Initial offset at the start of transmission
        const expectedTotalChunks = Math.ceil(file.size / 65536);
        const startChunkIndex = Math.floor(initialOffset / 65536);
        const expectedChunksSent = expectedTotalChunks - startChunkIndex;

        postLogToBackend(
          `[DEBUG-CHUNKS] ✅ Transfer complete - file: ${file.name}, time: ${(
            totalTime / 1000
          ).toFixed(1)}s, speed: ${avgSpeedMBps.toFixed(1)}MB/s`
        );
        postLogToBackend(
          `[DEBUG-CHUNKS] Chunks sent: ${networkChunkIndex}, expected: ${expectedChunksSent}, startChunk: ${startChunkIndex}, totalFileChunks: ${expectedTotalChunks}, initialOffset: ${initialOffset}`
        );

        if (networkChunkIndex !== expectedChunksSent) {
          postLogToBackend(
            `[DEBUG-CHUNKS] ⚠️ CHUNK MISMATCH: sent ${networkChunkIndex} but expected ${expectedChunksSent}`
          );
        }
      }
    } catch (error: any) {
      const errorMessage = `Streaming send error: ${error.message}`;
      if (developmentEnv === "development") {
        postLogToBackend(`[DEBUG] ❌ Transfer error: ${errorMessage}`);
      }
      this.fireError(errorMessage, {
        fileId,
        peerId,
        offset: peerState.readOffset,
      });
      throw error;
    } finally {
      // Clean up resources
      streamReader.cleanup();
    }
  }

  /**
   * ⏳ Wait for transfer completion confirmation
   */
  private async waitForTransferComplete(peerId: string): Promise<void> {
    while (true) {
      const currentPeerState = this.stateManager.getPeerState(peerId);

      // Check if it has been cleaned up or does not exist
      if (!currentPeerState || !currentPeerState.isSending) {
        this.log("log", `Transfer completed or peer disconnected: ${peerId}`);
        break;
      }

      // Check if the WebRTC connection is still valid
      if (!this.webrtcConnection.peerConnections.has(peerId)) {
        this.log("log", `Peer connection lost: ${peerId}, stopping transfer`);
        this.stateManager.updatePeerState(peerId, { isSending: false });
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * 📋 Get file metadata
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
   * ❌ Abort file sending
   */
  private abortFileSend(fileId: string, peerId: string): void {
    this.log("warn", `Aborting file send for ${fileId} to ${peerId}`);
    this.stateManager.resetPeerState(peerId);
  }

  /**
   * 🔧 Set up data handler
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
   * 🔥 Error handling
   */
  private fireError(message: string, context?: Record<string, any>) {
    this.webrtcConnection.fireError(message, {
      ...context,
      component: "FileTransferOrchestrator",
    });
  }

  // ===== State Query and Debugging =====

  /**
   * 📊 Get transfer statistics
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
   * 🔄 Handle peer reconnection
   */
  public handlePeerReconnection(peerId: string): void {
    // Clear all transfer states for this peer
    this.stateManager.clearPeerState(peerId);
    if (developmentEnv === "development")
      this.log(
        "log",
        `Successfully reset transfer state for reconnected peer ${peerId}`
      );
  }

  /**
   * 🧹 Clean up all resources
   */
  public cleanup(): void {
    this.stateManager.cleanup();
    this.networkTransmitter.cleanup();
    this.progressTracker.cleanup();
    this.messageHandler.cleanup();
    if (developmentEnv === "development")
      this.log("log", "FileTransferOrchestrator cleaned up");
  }
}
