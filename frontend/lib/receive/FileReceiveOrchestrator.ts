import WebRTC_Recipient from "../webrtc_Recipient";
import { CustomFile, fileMetadata } from "@/types/webrtc";
import {
  ActiveFileReception,
  ReceptionLifecycleState,
  ReceptionStateManager,
} from "./ReceptionStateManager";
import { MessageProcessor, MessageProcessorDelegate } from "./MessageProcessor";
import { ChunkProcessor } from "./ChunkProcessor";
import {
  StreamingFileWriter
} from "./StreamingFileWriter";
import { FileAssembler } from "./FileAssembler";
import { ProgressReporter, ProgressCallback } from "./ProgressReporter";
import { ReceptionConfig } from "./ReceptionConfig";
import { ChunkRangeCalculator } from "@/lib/utils/ChunkRangeCalculator";
import { postLogToBackend } from "@/app/config/api";

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
  private lifecycleTask: Promise<void> | null = null;

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

    this.log("log", "FileReceiveOrchestrator initialized");
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
      this.log("warn", "Another file reception is already in progress.");
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
          this.log("log", "File already fully downloaded.", { fileId });
          this.progressReporter.reportFileComplete(fileId);
          return;
        }
        this.log("log", `Resuming file from offset: ${offset}`, { fileId });
      } catch (e) {
        this.log("log", "Partial file not found, starting from scratch.", {
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

      postLogToBackend(
        `[RECV-SUMMARY] File: ${fileInfo.name}, expected: ${expectedChunksCount}, calculated: ${chunkRange.totalChunks}, startChunk: ${chunkRange.startChunk}, endChunk: ${chunkRange.endChunk}, absoluteTotal: ${chunkRange.absoluteTotalChunks}`
      );
    }

    const receptionPromise = this.stateManager.startFileReception(
      fileInfo,
      expectedChunksCount,
      offset
    );

    if (shouldSaveToDisk) {
      await this.createDiskWriteStream(fileInfo, offset);
    }

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
      this.log("warn", "No files found for the requested folder.", {
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
      "log",
      `Requesting folder, initial received size: ${initialFolderReceivedSize}`,
      { folderName }
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
      postLogToBackend(
        `[DEBUG] 📁 All files in folder completed - ${folderName}, files: ${completedFileIds.length}/${folderProgress.fileIds.length}`
      );
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
    level: "log" | "warn" | "error",
    message: string,
    context?: Record<string, any>
  ): void {
    const prefix = `[FileReceiveOrchestrator]`;
    console[level](prefix, message, context || "");
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
      this.log("warn", "Ignoring binary chunk while receiver is transitioning", {
        lifecycleState: this.stateManager.getLifecycleState(),
      });
      return;
    }

    const activeReception = this.stateManager.getActiveFileReception();
    if (!activeReception) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG] ERROR: Received file chunk but no active file reception!`
        );
      }
      this.fireError("Received a file chunk without an active file reception.");
      return;
    }

    // Convert to ArrayBuffer
    const arrayBuffer = await this.chunkProcessor.convertToArrayBuffer(data);
    if (!arrayBuffer) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG] ERROR: Failed to convert binary data to ArrayBuffer`
        );
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
      console.log(
        `[FileReceiveOrchestrator] Ignoring chunk ${chunkMeta.chunkIndex} - file reception already closed`
      );
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
      this.log("warn", "Chunk validation failed", {
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
        postLogToBackend(
          `[DEBUG-CHUNKS] ❌ Invalid relative chunk index - absolute:${result.absoluteChunkIndex}, relative:${result.relativeChunkIndex}, arraySize:${reception.chunks.length}`
        );
      }
      return;
    }

    // Store chunk
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

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-COMPLETE] ✅ Starting finalization - isDataComplete:${stats.isDataComplete}`
        );
      }

      try {
        await this.finalizeFileReceive();
        this.stateManager.completeFileReception();
      } catch (error) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          postLogToBackend(`[DEBUG] ❌ Auto-finalize ERROR: ${error}`);
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
        postLogToBackend(
          `[DEBUG-FINALIZE] ❌ Cannot finalize - missing writeStream:${!!reception?.writeStream} or fileHandle:${!!reception?.fileHandle}`
        );
      }
      return;
    }

    try {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-FINALIZE] 🚀 Starting finalization for ${reception.meta.name}`
        );
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
        postLogToBackend(
          `[DEBUG-FINALIZE] ✅ LARGE_FILE finalized successfully - ${reception.meta.name}`
        );
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
        postLogToBackend(
          `[DEBUG-FINALIZE] 📤 LARGE_FILE completion confirmation sent - ${reception.meta.fileId}, size: ${stats.currentTotalSize}, chunks: ${stats.sequencedCount}`
        );
      }
    } catch (error) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-FINALIZE] ❌ Error during finalization: ${error}`
        );
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
      this.log("error", message, context);
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
    await this.runLifecycleTransition("shutting_down", async () => {
      this.log("log", `Graceful shutdown initiated: ${reason}`);

      const reception = this.stateManager.getActiveFileReception();
      if (reception) {
        await this.closeAndAbortActiveReception(
          reception,
          "graceful shutdown",
          reason
        );
      }

      this.stateManager.gracefulCleanup();
      this.log("log", "Graceful shutdown completed");
    });
  }

  /**
   * Force reset all internal states
   */
  public async forceReset(): Promise<void> {
    await this.runLifecycleTransition("resetting", async () => {
      this.log("log", "Force resetting FileReceiveOrchestrator state");

      const reception = this.stateManager.getActiveFileReception();
      if (reception) {
        await this.closeAndAbortActiveReception(
          reception,
          "force reset",
          "FORCE_RESET"
        );
      }

      this.stateManager.forceReset();
      this.progressReporter.resetAllProgress();
      this.log("log", "FileReceiveOrchestrator state force reset completed");
    });
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
    await this.gracefulShutdown("CLEANUP");
    this.progressReporter.cleanup();
    this.messageProcessor.cleanup();
    this.log("log", "FileReceiveOrchestrator cleaned up");
  }

  private ensureReceiverAvailable(action: string): void {
    const lifecycleState = this.stateManager.getLifecycleState();
    if (lifecycleState === "idle") {
      return;
    }

    throw new Error(`Cannot ${action} while receiver is ${lifecycleState}`);
  }

  private isReceiverTransitioning(): boolean {
    const lifecycleState = this.stateManager.getLifecycleState();
    return (
      lifecycleState === "shutting_down" || lifecycleState === "resetting"
    );
  }

  private async runLifecycleTransition(
    nextState: ReceptionLifecycleState,
    action: () => Promise<void>
  ): Promise<void> {
    if (this.lifecycleTask) {
      await this.lifecycleTask;
      return;
    }

    this.stateManager.setLifecycleState(nextState);
    this.lifecycleTask = action().finally(() => {
      this.lifecycleTask = null;
    });
    await this.lifecycleTask;
  }

  private async closeAndAbortActiveReception(
    reception: ActiveFileReception,
    action: string,
    reason: string
  ): Promise<void> {
    await this.closeActiveReceptionResources(reception, action);

    if (this.stateManager.getActiveFileReception() === reception) {
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
        this.log("error", `Error closing sequenced writer during ${action}`, {
          err,
        });
      }
    }

    if (reception.writeStream) {
      try {
        await reception.writeStream.close();
      } catch (err) {
        this.log("error", `Error closing write stream during ${action}`, {
          err,
        });
      }
    }
  }
}
