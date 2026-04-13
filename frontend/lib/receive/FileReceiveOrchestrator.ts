import WebRTC_Recipient from "../webrtc_Recipient";
import { CustomFile, fileMetadata } from "@/types/webrtc";
import {
  ActiveFileReception,
  ReceptionStateManager,
} from "./ReceptionStateManager";
import {
  getReceiverShutdownPolicy,
  ReceiverShutdownAction,
  ReceiverShutdownRequest,
  mergeReceiverShutdownRequests,
} from "./receiverShutdown";
import { MessageProcessor, MessageProcessorDelegate } from "./MessageProcessor";
import { ChunkProcessor } from "./ChunkProcessor";
import {
  StreamingFileWriter
} from "./StreamingFileWriter";
import { FileAssembler } from "./FileAssembler";
import { ProgressReporter, ProgressCallback } from "./ProgressReporter";
import { ReceptionConfig } from "./ReceptionConfig";
import {
  canStartReception,
  isTransitioningReceptionLifecycle,
  resolveReceptionLifecycleState,
} from "./receptionStateMachine";
import { ChunkRangeCalculator } from "@/lib/utils/ChunkRangeCalculator";
import { createLogger, type RuntimeLogLevel } from "@/lib/logger";

const logger = createLogger({ scope: "Receive.Orchestrator" });

/**
 * 🚀 File receive orchestrator
 * Main coordinator that integrates all reception modules
 */
export class FileReceiveOrchestrator implements MessageProcessorDelegate {
  private stateManager: ReceptionStateManager;
  private messageProcessor: MessageProcessor;
  private chunkProcessor: ChunkProcessor;
  private streamingFileWriter: StreamingFileWriter;
  private fileAssembler: FileAssembler;
  private progressReporter: ProgressReporter;
  private shutdownDrainTask: Promise<void> | null = null;
  private pendingShutdown: ReceiverShutdownRequest | null = null;

  // Callbacks
  public onFileMetaReceived: ((meta: fileMetadata) => void) | undefined =
    undefined;
  public onStringReceived: ((str: string) => void) | undefined = undefined;
  public onFileReceived: ((file: CustomFile) => Promise<void>) | undefined =
    undefined;

  constructor(private webrtcConnection: WebRTC_Recipient) {
    // Initialize all components
    this.stateManager = new ReceptionStateManager();
    this.chunkProcessor = new ChunkProcessor();
    this.streamingFileWriter = new StreamingFileWriter();
    this.fileAssembler = new FileAssembler();
    this.progressReporter = new ProgressReporter(this.stateManager);
    this.messageProcessor = new MessageProcessor(
      this.stateManager,
      webrtcConnection,
      {
        onFileMetaReceived: (meta: fileMetadata) => {
          if (this.onFileMetaReceived) {
            this.onFileMetaReceived(meta);
          }
        },
        onStringReceived: (str: string) => {
          if (this.onStringReceived) {
            this.onStringReceived(str);
          }
        },
        log: this.log.bind(this),
      }
    );

    // Set up data handler
    this.setupDataHandler();

    this.log("info", "receive_orchestrator_initialized");
  }

  // ===== Public API =====

  /**
   * Set progress callback
   */
  public setProgressCallback(callback: ProgressCallback): void {
    this.progressReporter.setProgressCallback(callback);
  }

  /**
   * Set save directory
   */
  public setSaveDirectory(directory: FileSystemDirectoryHandle): Promise<void> {
    this.stateManager.setSaveDirectory(directory);
    this.streamingFileWriter.setSaveDirectory(directory);
    return Promise.resolve();
  }

  /**
   * Request a single file from the peer
   */
  public async requestFile(fileId: string, singleFile = true): Promise<void> {
    this.ensureReceiverAvailable("request a file");

    const activeReception = this.stateManager.getActiveFileReception();
    if (activeReception) {
      this.log("warn", "file_reception_already_in_progress");
      return;
    }

    if (singleFile) {
      this.stateManager.setCurrentFolderName(null);
    }

    const fileInfo = this.stateManager.getFileMetadata(fileId);
    if (!fileInfo) {
      this.fireError("File info not found for the requested fileId", {
        fileId,
      });
      return;
    }

    const shouldSaveToDisk = ReceptionConfig.shouldSaveToDisk(
      fileInfo.size,
      this.streamingFileWriter.hasSaveDirectory()
    );

    // Set save type at the beginning to prevent race conditions
    this.stateManager.setSaveType(fileInfo.fileId, shouldSaveToDisk);
    const currentFolderName = this.stateManager.getCurrentFolderName();
    if (currentFolderName) {
      this.stateManager.setSaveType(currentFolderName, shouldSaveToDisk);
    }

    let offset = 0;
    if (shouldSaveToDisk && this.streamingFileWriter.hasSaveDirectory()) {
      try {
        offset = await this.streamingFileWriter.getPartialFileSize(
          fileInfo.name,
          fileInfo.fullName
        );

        if (offset === fileInfo.size) {
          this.log("info", "file_already_downloaded", { fileId });
          this.progressReporter.reportFileComplete(fileId);
          return;
        }
        this.log("info", "file_resume_started", { fileId, offset });
      } catch (e) {
        this.log("info", "partial_file_missing_restart_from_zero", {
          fileId,
        });
        offset = 0;
      }
    }

    const expectedChunksCount = ReceptionConfig.calculateExpectedChunks(
      fileInfo.size,
      offset
    );

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      // 🎯 Critical log 2: Summary information for receiver - using unified chunk range calculation logic
      const chunkRange = ChunkRangeCalculator.getChunkRange(
        fileInfo.size,
        offset,
        ReceptionConfig.FILE_CONFIG.CHUNK_SIZE
      );

      logger.debug({
        event: "receive_summary",
        context: {
          fileName: fileInfo.name,
          expectedChunksCount,
          calculatedChunks: chunkRange.totalChunks,
          startChunk: chunkRange.startChunk,
          endChunk: chunkRange.endChunk,
          absoluteTotalChunks: chunkRange.absoluteTotalChunks,
        },
      });
    }

    const receptionPromise = this.stateManager.startFileReception(
      fileInfo,
      expectedChunksCount,
      offset
    );

    if (shouldSaveToDisk) {
      try {
        await this.createDiskWriteStream(fileInfo, offset);
      } catch {
        return receptionPromise;
      }
    }

    this.stateManager.markFileRequestDispatched();

    // Send file request
    const sendResult = await this.messageProcessor.sendFileRequest(fileId, offset);
    if (!sendResult.ok) {
      this.stateManager.failFileReception(
        new Error(`Failed to send file request: ${sendResult.reason || sendResult.finalState}`)
      );
      return;
    }

    return receptionPromise;
  }

  /**
   * Request all files belonging to a folder from the peer
   */
  public async requestFolder(folderName: string): Promise<void> {
    this.ensureReceiverAvailable("request a folder");

    const folderProgress = this.stateManager.getFolderProgress(folderName);
    if (!folderProgress || folderProgress.fileIds.length === 0) {
      this.log("warn", "folder_request_missing_files", {
        folderName,
      });
      return;
    }

    // Pre-calculate total size of already downloaded parts
    let initialFolderReceivedSize = 0;
    if (this.streamingFileWriter.hasSaveDirectory()) {
      for (const fileId of folderProgress.fileIds) {
        const fileInfo = this.stateManager.getFileMetadata(fileId);
        if (fileInfo) {
          try {
            const partialSize =
              await this.streamingFileWriter.getPartialFileSize(
                fileInfo.name,
                fileInfo.fullName
              );
            initialFolderReceivedSize += partialSize;
          } catch (e) {
            // File doesn't exist, so its size is 0
          }
        }
      }
    }

    this.stateManager.setFolderReceivedSize(
      folderName,
      initialFolderReceivedSize
    );
    this.log(
      "info",
      "folder_request_started",
      {
        folderName,
        initialFolderReceivedSize,
      }
    );

    this.stateManager.setCurrentFolderName(folderName);

    for (const fileId of folderProgress.fileIds) {
      try {
        await this.requestFile(fileId, false);
      } catch (error) {
        this.fireError(
          `Failed to receive file ${fileId} in folder ${folderName}`,
          { error }
        );
        break;
      }
    }

    this.stateManager.setCurrentFolderName(null);

    // Send folder completion message
    const completedFileIds = folderProgress.fileIds.filter(() => true); // Assume all succeeded

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      logger.debug({
        event: "folder_request_completed",
        context: {
          folderName,
          completedFiles: completedFileIds.length,
          totalFiles: folderProgress.fileIds.length,
        },
      });
    }

    const sendResult = await this.messageProcessor.sendFolderReceiveComplete(
      folderName,
      completedFileIds,
      true
    );

    if (!sendResult.ok) {
      this.fireError("Failed to send folder completion confirmation", {
        folderName,
        sendResult,
      });
    }
  }

  // ===== MessageProcessorDelegate Implementation =====

  // Note: These are implemented as properties, not methods, to avoid infinite recursion

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

  // ===== Internal Methods =====

  /**
   * Set up data handler
   */
  private setupDataHandler(): void {
    this.webrtcConnection.onDataReceived = async (data, peerId) => {
      const binaryData = await this.messageProcessor.handleReceivedMessage(
        data,
        peerId
      );

      if (binaryData) {
        // Handle binary chunk data
        await this.handleBinaryChunkData(binaryData);
      }
    };
  }

  /**
   * Handle binary chunk data
   */
  private async handleBinaryChunkData(data: any): Promise<void> {
    if (this.isReceiverTransitioning()) {
      this.log("warn", "binary_chunk_ignored_during_transition", {
        lifecycleState: this.stateManager.getLifecycleState(),
      });
      return;
    }

    const activeReception = this.stateManager.getActiveFileReception();
    if (!activeReception) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "binary_chunk_without_active_reception",
        });
      }
      this.fireError("Received a file chunk without an active file reception.");
      return;
    }

    // Convert to ArrayBuffer
    const arrayBuffer = await this.chunkProcessor.convertToArrayBuffer(data);
    if (!arrayBuffer) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "binary_chunk_convert_failed",
        });
      }
      this.fireError("Received unsupported binary data format", {
        dataType: Object.prototype.toString.call(data),
      });
      return;
    }

    await this.handleEmbeddedChunkPacket(arrayBuffer);
  }

  /**
   * Handle embedded chunk packet
   */
  private async handleEmbeddedChunkPacket(
    arrayBuffer: ArrayBuffer
  ): Promise<void> {
    const parsed = this.chunkProcessor.parseEmbeddedChunkPacket(arrayBuffer);
    if (!parsed) {
      this.fireError("Failed to parse embedded chunk packet");
      return;
    }

    const { chunkMeta, chunkData } = parsed;
    const reception = this.stateManager.getActiveFileReception();
    if (!reception) {
      logger.info({
        event: "chunk_ignored_after_reception_closed",
        context: {
          chunkIndex: chunkMeta.chunkIndex,
        },
      });
      return;
    }

    // Validate chunk
    const validation = this.chunkProcessor.validateChunk(
      chunkMeta,
      reception.meta.fileId,
      reception.expectedChunksCount,
      reception.initialOffset
    );

    if (!validation.isValid) {
      this.log("warn", "chunk_validation_failed", {
        errors: validation.errors,
        chunkIndex: chunkMeta.chunkIndex,
      });
      return;
    }

    // Process chunk indices
    const result = this.chunkProcessor.processReceivedChunk(
      chunkMeta,
      chunkData,
      reception.initialOffset
    );

    if (!result) {
      this.fireError("Failed to process received chunk");
      return;
    }

    // Check if chunk index is valid
    if (
      !this.chunkProcessor.isChunkIndexValid(
        result.relativeChunkIndex,
        reception.expectedChunksCount
      )
    ) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "relative_chunk_index_invalid",
          context: {
            absoluteChunkIndex: result.absoluteChunkIndex,
            relativeChunkIndex: result.relativeChunkIndex,
            arraySize: reception.chunks.length,
          },
        });
      }
      return;
    }

    // Store chunk
    this.stateManager.markFileReceiving();
    reception.chunks[result.relativeChunkIndex] = result.chunkData;
    reception.chunkSequenceMap.set(result.absoluteChunkIndex, true);
    reception.receivedChunksCount++;

    // Update progress
    this.progressReporter.updateFileProgress(
      result.chunkData.byteLength,
      reception.meta.fileId,
      reception.meta.size
    );

    // Handle disk writing if needed
    if (reception.sequencedWriter) {
      // 🔧 Fix: SequencedWriter uses absolute index, ensuring correct index is passed
      this.chunkProcessor.logChunkDetails(
        result,
        reception.expectedChunksCount,
        reception.sequencedWriter.expectedIndex
      );

      // ✅ Correctly use absolute index for disk writing
      await reception.sequencedWriter.writeChunk(
        result.absoluteChunkIndex,
        result.chunkData
      );
    }

    await this.checkAndAutoFinalize();
  }

  /**
   * Check and auto-finalize file reception
   */
  private async checkAndAutoFinalize(): Promise<void> {
    const reception = this.stateManager.getActiveFileReception();
    if (!reception || reception.isFinalized) return;

    const expectedSize = reception.meta.size - reception.initialOffset;
    const stats = this.chunkProcessor.calculateCompletionStats(
      reception.chunks,
      reception.expectedChunksCount,
      expectedSize
    );

    // Log completion check details
    this.chunkProcessor.logCompletionCheck(
      reception.meta.name,
      {
        sequencedCount: stats.sequencedCount,
        expectedChunksCount: reception.expectedChunksCount,
        currentTotalSize: stats.currentTotalSize,
        expectedSize,
        isDataComplete: stats.isDataComplete,
      },
      reception.chunks,
      reception.initialOffset
    );

    if (stats.isDataComplete) {
      reception.isFinalized = true;
      this.stateManager.markFileFinalizing();

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "auto_finalization_started",
          context: {
            isDataComplete: stats.isDataComplete,
            fileId: reception.meta.fileId,
          },
        });
      }

      try {
        await this.finalizeFileReceive();
        this.stateManager.completeFileReception();
      } catch (error) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          logger.error({
            event: "auto_finalization_failed",
            context: { error },
          });
        }
        this.stateManager.failFileReception(error);
      }
    }
  }

  /**
   * Finalize file reception
   */
  private async finalizeFileReceive(): Promise<void> {
    const reception = this.stateManager.getActiveFileReception();
    if (!reception) return;

    if (reception.writeStream) {
      await this.finalizeLargeFileReceive();
    } else {
      await this.finalizeMemoryFileReceive();
    }
  }

  /**
   * Finalize large file reception (disk-based)
   */
  private async finalizeLargeFileReceive(): Promise<void> {
    const reception = this.stateManager.getActiveFileReception();
    if (!reception?.writeStream || !reception.fileHandle) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "large_file_finalize_missing_resources",
          context: {
            hasWriteStream: !!reception?.writeStream,
            hasFileHandle: !!reception?.fileHandle,
          },
        });
      }
      return;
    }

    try {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "large_file_finalization_started",
          context: {
            fileName: reception.meta.name,
          },
        });
      }

      // Finalize using StreamingFileWriter
      if (reception.sequencedWriter && reception.writeStream) {
        await this.streamingFileWriter.finalizeWrite(
          reception.sequencedWriter,
          reception.writeStream,
          reception.meta.name
        );
      }

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "large_file_finalized",
          context: {
            fileName: reception.meta.name,
          },
        });
      }

      // 🆕 Send completion confirmation for large files
      const stats = this.chunkProcessor.calculateCompletionStats(
        reception.chunks,
        reception.expectedChunksCount,
        reception.meta.size - reception.initialOffset
      );

      const sendResult = await this.messageProcessor.sendFileReceiveComplete(
        reception.meta.fileId,
        stats.currentTotalSize,
        stats.sequencedCount,
        true
      );

      if (!sendResult.ok) {
        this.fireError("Failed to send large file completion confirmation", {
          fileId: reception.meta.fileId,
          sendResult,
        });
      }

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "large_file_completion_confirmation_sent",
          context: {
            fileId: reception.meta.fileId,
            size: stats.currentTotalSize,
            chunks: stats.sequencedCount,
          },
        });
      }
    } catch (error) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "large_file_finalization_failed",
          context: { error },
        });
      }
      this.fireError("Error finalizing large file", { error });
    }
  }

  /**
   * Finalize memory file reception
   */
  private async finalizeMemoryFileReceive(): Promise<void> {
    const reception = this.stateManager.getActiveFileReception();
    if (!reception) return;

    const currentFolderName = this.stateManager.getCurrentFolderName();
    const result = await this.fileAssembler.assembleFileFromChunks(
      reception.chunks,
      reception.meta,
      currentFolderName,
      this.onFileReceived
    );

    // Send completion confirmation
    const sendResult = await this.messageProcessor.sendFileReceiveComplete(
      reception.meta.fileId,
      result.totalChunkSize,
      result.validChunks,
      result.storeUpdated
    );

    if (!sendResult.ok) {
      this.fireError("Failed to send file completion confirmation", {
        fileId: reception.meta.fileId,
        sendResult,
      });
    }
  }

  /**
   * Create disk write stream
   */
  private async createDiskWriteStream(
    meta: fileMetadata,
    offset: number
  ): Promise<void> {
    try {
      const { fileHandle, writeStream, sequencedWriter } =
        await this.streamingFileWriter.createWriteStream(
          meta.name,
          meta.fullName,
          offset
        );

      this.stateManager.updateActiveFileReception({
        fileHandle,
        writeStream,
        sequencedWriter,
      });
    } catch (err) {
      this.fireError("Failed to create file on disk", {
        err,
        fileName: meta.name,
      });
      throw err;
    }
  }

  /**
   * Error handling
   */
  private fireError(message: string, context?: Record<string, any>) {
    if (this.webrtcConnection.fireError) {
      // @ts-ignore
      this.webrtcConnection.fireError(message, {
        ...context,
        component: "FileReceiveOrchestrator",
      });
    } else {
      this.log("error", "receive_error_reported", {
        message,
        ...(context ? { context } : {}),
      });
    }

    const reception = this.stateManager.getActiveFileReception();
    if (reception) {
      void this.closeAndAbortActiveReception(
        reception,
        "error cleanup",
        message
      );
    }
  }

  // ===== Lifecycle Management =====

  /**
   * Graceful shutdown
   */
  public async gracefulShutdown(
    reason: string = "CONNECTION_LOST"
  ): Promise<void> {
    await this.shutdown("peer_disconnect", reason);
  }

  /**
   * Force reset all internal states
   */
  public async forceReset(): Promise<void> {
    await this.shutdown("force_reset", "FORCE_RESET");
  }

  /**
   * Get transfer statistics
   */
  public getTransferStats() {
    return {
      stateManager: this.stateManager.getStateStats(),
      progressReporter: this.progressReporter.getProgressStats(),
      messageProcessor: this.messageProcessor.getMessageStats(),
    };
  }

  /**
   * Get save type information (for backward compatibility)
   */
  public getSaveType(): Record<string, boolean> {
    return this.stateManager.saveType;
  }

  /**
   * Get pending files metadata (for backward compatibility)
   */
  public getPendingFilesMeta(): Map<string, fileMetadata> {
    return this.stateManager.getAllFileMetadata();
  }

  /**
   * Get folder progresses (for backward compatibility)
   */
  public getFolderProgresses(): Record<string, any> {
    return this.stateManager.getAllFolderProgresses();
  }

  /**
   * Clean up all resources
   */
  public async cleanup(): Promise<void> {
    await this.shutdown("cleanup", "CLEANUP");
  }

  public async leaveRoom(): Promise<void> {
    await this.shutdown("leave_room", "LEAVE_ROOM");
  }

  public async handlePeerDisconnect(
    reason: string = "CONNECTION_LOST"
  ): Promise<void> {
    await this.shutdown("peer_disconnect", reason);
  }

  public async shutdown(
    action: ReceiverShutdownAction,
    reason?: string
  ): Promise<void> {
    const shutdownReason = reason ?? action.toUpperCase();
    this.enqueueShutdown({ action, reason: shutdownReason });
    const task = this.shutdownDrainTask;
    if (!task) {
      return;
    }
    await task;
  }

  private enqueueShutdown(request: ReceiverShutdownRequest): void {
    this.pendingShutdown = mergeReceiverShutdownRequests(
      this.pendingShutdown,
      request
    );

    if (this.shutdownDrainTask) {
      return;
    }

    this.shutdownDrainTask = this.drainShutdownQueue().finally(() => {
      this.shutdownDrainTask = null;
    });
  }

  private async drainShutdownQueue(): Promise<void> {
    while (this.pendingShutdown) {
      const request = this.pendingShutdown;
      this.pendingShutdown = null;

      await this.executeShutdown(request.action, request.reason);
    }
  }

  private async executeShutdown(
    action: ReceiverShutdownAction,
    shutdownReason: string
  ): Promise<void> {
    const policy = getReceiverShutdownPolicy(action);

    this.stateManager.setLifecycleState(
      resolveReceptionLifecycleState(this.stateManager.getLifecycleState(), {
        type: "enter_shutdown",
        nextState: policy.lifecycleState,
      })
    );

    await (async () => {
      this.log("info", "receiver_shutdown_started", {
        action,
        reason: shutdownReason,
        policy,
      });

      const reception = this.stateManager.getActiveFileReception();
      if (reception) {
        await this.closeAndAbortActiveReception(
          reception,
          action,
          shutdownReason
        );
      }

      this.stateManager.resetState({
        preserveMetadata: policy.preserveMetadata,
        preserveSaveType: policy.preserveSaveType,
        preserveSaveDirectory: policy.preserveSaveDirectory,
        nextLifecycleState:
          action === "peer_disconnect" && policy.allowResume
            ? "interrupted"
            : "idle",
      });

      if (policy.resetProgress) {
        this.progressReporter.resetAllProgress();
      }

      if (policy.disposeProcessors) {
        this.progressReporter.cleanup();
        this.messageProcessor.cleanup();
      }

      this.log("info", "receiver_shutdown_completed", { action });
    })();
  }

  private ensureReceiverAvailable(action: string): void {
    const lifecycleState = this.stateManager.getLifecycleState();
    if (canStartReception(lifecycleState)) {
      return;
    }

    throw new Error(`Cannot ${action} while receiver is ${lifecycleState}`);
  }

  private isReceiverTransitioning(): boolean {
    return isTransitioningReceptionLifecycle(
      this.stateManager.getLifecycleState()
    );
  }

  private async closeAndAbortActiveReception(
    reception: ActiveFileReception,
    action: string,
    reason: string
  ): Promise<void> {
    await this.closeActiveReceptionResources(reception, action);

    if (this.stateManager.getActiveFileReception() === reception) {
      if (this.isReceiverTransitioning()) {
        this.stateManager.cancelActiveFileReception(new Error(reason));
        return;
      }

      if (action === "peer_disconnect") {
        this.stateManager.interruptFileReception(new Error(reason));
        return;
      }

      this.stateManager.failFileReception(new Error(reason));
    }
  }

  private async closeActiveReceptionResources(
    reception: ActiveFileReception,
    action: string
  ): Promise<void> {
    if (reception.sequencedWriter) {
      try {
        await reception.sequencedWriter.close();
      } catch (err) {
        this.log("error", "sequenced_writer_close_failed", {
          action,
          err,
        });
      }
    }

    if (reception.writeStream) {
      try {
        await reception.writeStream.close();
      } catch (err) {
        this.log("error", "write_stream_close_failed", {
          action,
          err,
        });
      }
    }
  }
}
