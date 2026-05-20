import { generateFileId } from "@/lib/fileUtils";
import {
  CustomFile,
  fileMetadata,
  WebRTCMessage,
  FileRequest,
  EmbeddedChunkMeta,
  PayloadSnapshot,
} from "@/types/webrtc";
import { StateManager } from "./StateManager";
import { MessageHandler, MessageHandlerDelegate } from "./MessageHandler";
import { NetworkTransmitter } from "./NetworkTransmitter";
import { ProgressTracker, ProgressCallback } from "./ProgressTracker";
import { StreamingFileReader } from "./StreamingFileReader";
import { TransferConfig } from "./TransferConfig";
import WebRTC_Initiator from "../webrtc_Initiator";
import { createLogger, type RuntimeLogLevel } from "@/lib/logger";

const logger = createLogger({ scope: "Transfer.Orchestrator" });
/**
 * 🚀 File transfer orchestrator
 * Integrates all components to provide unified file transfer services
 */
export class FileTransferOrchestrator implements MessageHandlerDelegate {
  private stateManager: StateManager;
  private messageHandler: MessageHandler;
  private networkTransmitter: NetworkTransmitter;
  private progressTracker: ProgressTracker;
  private activeFileSendPeers = new Map<string, Set<string>>();
  private deferredResumeRequests = new Map<
    string,
    Array<{ peerId: string; resolve: () => void }>
  >();

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

    this.log("info", "transfer_orchestrator_initialized");
  }
  /**
   * 🎯 Send a payload snapshot so receivers can reconcile clears/removals
   */
  public async sendPayloadSnapshot(
    content: string,
    files: CustomFile[],
    peerId: string
  ): Promise<void> {
    const payloadSnapshot: PayloadSnapshot = {
      type: "payloadSnapshot",
      hasContent: content.trim().length > 0,
      fileIds: files.map((file) => generateFileId(file)),
    };

    const sendResult = await this.webrtcConnection.sendData(
      JSON.stringify(payloadSnapshot),
      peerId
    );

    if (!sendResult.ok) {
      this.fireError("Failed to send payload snapshot", {
        payloadSnapshot,
        peerId,
        sendResult,
      });
    }
  }

  /**
   * 🎯 Send file metadata
   */
  public async sendFileMeta(
    files: CustomFile[],
    peerId?: string
  ): Promise<void> {
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

    for (const pId of peers) {
      for (const file of files) {
        const fileId = generateFileId(file);
        this.stateManager.addPendingFile(fileId, file);

        const fileMeta = this.getFileMeta(file);
        const metaDataString = JSON.stringify(fileMeta);

        const sendResult = await this.webrtcConnection.sendData(
          metaDataString,
          pId
        );
        if (!sendResult.ok) {
          this.fireError("Failed to send file metadata", {
            fileMeta,
            peerId: pId,
            sendResult,
          });
        }
      }
    }
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
      "info",
      "string_sent",
      {
        peerId,
        contentLength: content.length,
        chunkCount: chunks.length,
      }
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

    await this.waitForResumeWindowIfNeeded(request.fileId, peerId, offset);
    this.registerActiveFileSend(request.fileId, peerId);

    try {
      await this.sendSingleFile(file, peerId, offset);
    } finally {
      this.unregisterActiveFileSend(request.fileId, peerId);
    }
  }

  /**
   * 📝 Logging (delegated from MessageHandler)
   */
  public log(
    level: RuntimeLogLevel,
    event: string,
    context?: Record<string, any>
  ): void {
    logger[level]({
      event,
      context,
    });
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
      this.log("warn", "file_send_already_in_progress", { peerId, fileId });
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

    logger.debug({
      event: "transfer_started",
      context: {
        fileName: file.name,
        sizeMb: Number((file.size / 1024 / 1024).toFixed(1)),
        peerId,
        initialOffset: initialReadOffset,
      },
    });

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
            "chunk_send_failed",
            {
              chunkIndex: chunkInfo.chunkIndex,
              error,
            }
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
        } else {
          const channelState = this.webrtcConnection.getDataChannelState(peerId);
          const peerStillConnected = this.webrtcConnection.peerConnections.has(peerId);

          if (!peerStillConnected || channelState !== "open") {
            this.log("info", "file_send_interrupted_by_disconnect", {
              fileId,
              peerId,
              chunkIndex: chunkInfo.chunkIndex,
              channelState,
              peerStillConnected,
            });
            this.stateManager.updatePeerState(peerId, { isSending: false });
            break;
          }

          throw new Error(
            `Chunk send failed while peer ${peerId} remained ${channelState}`
          );
        }

        networkChunkIndex++;

        // Check if it's the last chunk
        if (chunkInfo.isLastChunk) {
          break;
        }
      }

      {
        const totalTime = performance.now() - transferStartTime;
        const avgSpeedMBps = totalBytesSent / 1024 / 1024 / (totalTime / 1000);

        // Use the initial offset captured at transfer start for log statistics.
        const initialOffset = initialReadOffset || 0;
        const expectedTotalChunks = Math.ceil(file.size / 65536);
        const startChunkIndex = Math.floor(initialOffset / 65536);
        const expectedChunksSent = expectedTotalChunks - startChunkIndex;

        logger.debug({
          event: "transfer_completed",
          context: {
            fileName: file.name,
            durationSeconds: Number((totalTime / 1000).toFixed(1)),
            speedMbps: Number(avgSpeedMBps.toFixed(1)),
            chunksSent: networkChunkIndex,
            expectedChunksSent,
            startChunkIndex,
            expectedTotalChunks,
            initialOffset,
            totalReadTime,
            totalSendTime,
            totalProgressTime,
            lastProgressTime,
          },
        });

        if (networkChunkIndex !== expectedChunksSent) {
          logger.warn({
            event: "transfer_chunk_count_mismatch",
            context: {
              fileName: file.name,
              chunksSent: networkChunkIndex,
              expectedChunksSent,
            },
          });
        }
      }
    } catch (error: any) {
      const errorMessage = `Streaming send error: ${error.message}`;
      logger.error({
        event: "transfer_failed",
        context: { errorMessage, fileId, peerId },
      });
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
        this.log("info", "transfer_wait_finished", { peerId });
        break;
      }

      // Check if the WebRTC connection is still valid
      if (!this.webrtcConnection.peerConnections.has(peerId)) {
        this.log("info", "transfer_stopped_peer_connection_lost", { peerId });
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
      lastModified: file.lastModified,
    };
  }

  /**
   * ❌ Abort file sending
   */
  private abortFileSend(fileId: string, peerId: string): void {
    this.log("warn", "file_send_aborted", { fileId, peerId });
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
    this.log("info", "peer_transfer_state_reset", { peerId });
  }

  /**
   * 🧹 Clean up all resources
   */
  public cleanup(): void {
    this.releaseAllDeferredResumeRequests();
    this.activeFileSendPeers.clear();
    this.stateManager.cleanup();
    this.networkTransmitter.cleanup();
    this.progressTracker.cleanup();
    this.messageHandler.cleanup();
    this.log("info", "transfer_orchestrator_cleaned_up");
  }

  private async waitForResumeWindowIfNeeded(
    fileId: string,
    peerId: string,
    offset: number
  ): Promise<void> {
    if (offset <= 0 || !this.hasOtherActiveFileSend(fileId, peerId)) {
      return;
    }

    this.log("info", "resume_request_deferred_until_active_peers_finish", {
      fileId,
      peerId,
      offset,
      activePeers: Array.from(this.activeFileSendPeers.get(fileId) ?? []).filter(
        (activePeerId) => activePeerId !== peerId
      ),
    });

    await new Promise<void>((resolve) => {
      const queue = this.deferredResumeRequests.get(fileId) ?? [];
      queue.push({ peerId, resolve });
      this.deferredResumeRequests.set(fileId, queue);
    });
  }

  private registerActiveFileSend(fileId: string, peerId: string): void {
    const peers = this.activeFileSendPeers.get(fileId) ?? new Set<string>();
    peers.add(peerId);
    this.activeFileSendPeers.set(fileId, peers);
  }

  private unregisterActiveFileSend(fileId: string, peerId: string): void {
    const peers = this.activeFileSendPeers.get(fileId);
    if (peers) {
      peers.delete(peerId);
      if (peers.size === 0) {
        this.activeFileSendPeers.delete(fileId);
      }
    }

    this.releaseNextDeferredResumeRequest(fileId);
  }

  private hasOtherActiveFileSend(fileId: string, peerId: string): boolean {
    const peers = this.activeFileSendPeers.get(fileId);
    if (!peers) {
      return false;
    }

    return Array.from(peers).some((activePeerId) => activePeerId !== peerId);
  }

  private releaseNextDeferredResumeRequest(fileId: string): void {
    if (this.activeFileSendPeers.has(fileId)) {
      return;
    }

    const queue = this.deferredResumeRequests.get(fileId);
    if (!queue || queue.length === 0) {
      return;
    }

    const next = queue.shift();
    if (!next) {
      return;
    }

    if (queue.length === 0) {
      this.deferredResumeRequests.delete(fileId);
    } else {
      this.deferredResumeRequests.set(fileId, queue);
    }

    next.resolve();
  }

  private releaseAllDeferredResumeRequests(): void {
    for (const queue of Array.from(this.deferredResumeRequests.values())) {
      for (const entry of queue) {
        entry.resolve();
      }
    }

    this.deferredResumeRequests.clear();
  }
}
