import { CustomFile } from "@/types/webrtc";
import { TransferConfig } from "./TransferConfig";
import { ChunkRangeCalculator } from "@/lib/utils/ChunkRangeCalculator";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NODE_ENV;
/**
 * 🚀 Network chunk interface
 */
export interface NetworkChunk {
  chunk: ArrayBuffer | null;
  chunkIndex: number;
  totalChunks: number;
  fileOffset: number;
  isLastChunk: boolean;
}

/**
 * 🚀 High-performance streaming file reader
 * Uses a two-layer buffering architecture: large batch reading + small network chunk sending
 * Solves file reading performance bottleneck issues
 */
export class StreamingFileReader {
  // Configuration parameters
  private readonly BATCH_SIZE =
    TransferConfig.FILE_CONFIG.CHUNK_SIZE *
    TransferConfig.FILE_CONFIG.BATCH_SIZE; // 32MB batches
  private readonly NETWORK_CHUNK_SIZE =
    TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE; // 64KB network chunks
  private readonly CHUNKS_PER_BATCH = this.BATCH_SIZE / this.NETWORK_CHUNK_SIZE; // 512 chunks

  // File state
  private file: File;
  private fileReader: FileReader;
  private totalFileSize: number;

  // Batch buffering state
  private currentBatch: ArrayBuffer | null = null; // Current 32MB batch data
  private currentBatchStartOffset = 0; // Starting position of current batch in file
  private currentChunkIndexInBatch = 0; // Index of current network chunk in batch

  // Global state
  private totalFileOffset = 0; // Current position in the entire file
  private startChunkIndex = 0; // 🔧 记录传输起始的chunk索引
  private isFinished = false;
  private isReading = false; // Prevent concurrent reading

  constructor(file: CustomFile, startOffset: number = 0) {
    this.file = file;
    this.totalFileSize = file.size;
    this.totalFileOffset = startOffset;
    // 🔧 修复：续传时currentBatchStartOffset应该从startOffset开始
    this.currentBatchStartOffset = startOffset;
    this.fileReader = new FileReader();

    // 🔧 记录传输的起始chunk索引，用于边界检测
    this.startChunkIndex = Math.floor(startOffset / this.NETWORK_CHUNK_SIZE);

    if (developmentEnv === "development") {
      // 🎯 关键日志1：发送端总结信息 - 使用统一的chunk范围计算逻辑
      const chunkRange = ChunkRangeCalculator.getChunkRange(
        this.totalFileSize,
        startOffset,
        this.NETWORK_CHUNK_SIZE
      );
      postLogToBackend(
        `[SEND-SUMMARY] File: ${file.name}, offset: ${startOffset}, startChunk: ${chunkRange.startChunk}, endChunk: ${chunkRange.endChunk}, willSend: ${chunkRange.totalChunks}, absoluteTotal: ${chunkRange.absoluteTotalChunks}`
      );
    }
  }

  /**
   * 🎯 Core method: Get next 64KB network chunk
   */
  async getNextNetworkChunk(): Promise<NetworkChunk> {
    // 1. Check if new batch needs to be loaded
    if (this.needsNewBatch()) {
      await this.loadNextBatch();
    }

    // 2. Check if end of file has been reached
    if (this.isFinished || !this.currentBatch) {
      return {
        chunk: null,
        chunkIndex: this.calculateGlobalChunkIndex(),
        totalChunks: this.calculateTotalNetworkChunks(),
        fileOffset: this.totalFileOffset,
        isLastChunk: true,
      };
    }

    // 3. Slice 64KB network chunk from current batch
    const networkChunk = this.sliceNetworkChunkFromBatch();
    const globalChunkIndex = this.calculateGlobalChunkIndex();
    const isLast = this.isLastNetworkChunk(networkChunk);

    // 4. Update state
    this.updateChunkState(networkChunk);

    // 🎯 关键日志：边界chunk验证（临时保留用于验证修复效果）
    if (developmentEnv === "development") {
      const totalChunks = this.calculateTotalNetworkChunks();

      // 🔧 修复：使用简化的边界检测逻辑
      const isFirst = globalChunkIndex === this.startChunkIndex;
      const expectedLastChunk = Math.floor(
        (this.totalFileSize - 1) / this.NETWORK_CHUNK_SIZE
      );
      const isRealLast = isLast && globalChunkIndex === expectedLastChunk;

      if (isFirst || isRealLast) {
        postLogToBackend(
          `[BOUNDARY] Chunk #${globalChunkIndex}/${totalChunks}, isFirst: ${isFirst}, isLast: ${isRealLast}, startIdx: ${this.startChunkIndex}, expectedLastIdx: ${expectedLastChunk}, size: ${networkChunk.byteLength}`
        );
      }
    }

    return {
      chunk: networkChunk,
      chunkIndex: globalChunkIndex,
      totalChunks: this.calculateTotalNetworkChunks(),
      fileOffset: this.totalFileOffset - networkChunk.byteLength,
      isLastChunk: isLast,
    };
  }

  /**
   * 🔍 Determine if new batch needs to be loaded
   */
  private needsNewBatch(): boolean {
    return (
      this.currentBatch === null || // No batch loaded yet
      this.currentChunkIndexInBatch >= this.CHUNKS_PER_BATCH || // Current batch exhausted
      this.isCurrentBatchEmpty() // Current batch has no data
    );
  }

  /**
   * 🔍 Check if current batch is empty
   */
  private isCurrentBatchEmpty(): boolean {
    if (!this.currentBatch) return true;

    const usedBytes = this.currentChunkIndexInBatch * this.NETWORK_CHUNK_SIZE;
    return usedBytes >= this.currentBatch.byteLength;
  }

  /**
   * 📥 Load next 32MB batch into memory
   */
  private async loadNextBatch(): Promise<void> {
    if (this.isReading) {
      // Prevent concurrent reading
      while (this.isReading) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return;
    }

    this.isReading = true;
    const startTime = performance.now();

    try {
      // 1. Clean up old batch memory
      this.currentBatch = null;

      // 2. Calculate size to read this time
      const remainingFileSize = this.totalFileSize - this.totalFileOffset;
      const batchSize = Math.min(this.BATCH_SIZE, remainingFileSize);

      if (batchSize <= 0) {
        this.isFinished = true;
        return;
      }

      // 3. Perform large chunk file reading
      const sliceStartTime = performance.now();
      const fileSlice = this.file.slice(
        this.totalFileOffset,
        this.totalFileOffset + batchSize
      );
      const sliceTime = performance.now() - sliceStartTime;

      // 4. Asynchronously read file data
      const readStartTime = performance.now();
      this.currentBatch = await this.readFileSlice(fileSlice);
      const readTime = performance.now() - readStartTime;

      const batchStartOffset = this.totalFileOffset;
      this.currentBatchStartOffset = batchStartOffset;

      // 🔧 修复：简化batch内索引计算逻辑
      // 由于calculateGlobalChunkIndex现在直接基于totalFileOffset计算，
      // batch内索引只需要基于当前batch的起始位置计算即可
      const chunkOffsetInBatch =
        batchStartOffset -
        Math.floor(batchStartOffset / this.BATCH_SIZE) * this.BATCH_SIZE;
      this.currentChunkIndexInBatch = Math.floor(
        chunkOffsetInBatch / this.NETWORK_CHUNK_SIZE
      );

      // Only output essential batch reading logs in development environment
      if (developmentEnv === "development" && batchSize > this.BATCH_SIZE / 2) {
        const totalTime = performance.now() - startTime;
        const speedMBps = batchSize / 1024 / 1024 / (totalTime / 1000);
        postLogToBackend(
          `[BATCH-READ] 📖 size: ${(batchSize / 1024 / 1024).toFixed(
            1
          )}MB, speed: ${speedMBps.toFixed(1)}MB/s`
        );
      }
    } catch (error) {
      if (developmentEnv === "development") {
        postLogToBackend(`[DEBUG] ❌ BATCH_READ failed: ${error}`);
      }
      throw new Error(`Failed to load file batch: ${error}`);
    } finally {
      this.isReading = false;
    }
  }

  /**
   * 📄 Perform file reading operation
   */
  private async readFileSlice(fileSlice: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.fileReader.onload = () => {
        const result = this.fileReader.result as ArrayBuffer;
        if (result) {
          resolve(result);
        } else {
          reject(new Error("FileReader result is null"));
        }
      };

      this.fileReader.onerror = () => {
        reject(
          new Error(
            `File reading failed: ${
              this.fileReader.error?.message || "Unknown error"
            }`
          )
        );
      };

      this.fileReader.readAsArrayBuffer(fileSlice);
    });
  }

  /**
   * ✂️ Slice 64KB network chunk from 32MB batch
   * 🆕 修复：直接基于offset在batch中的位置计算，避免复杂的batch内索引计算
   */
  private sliceNetworkChunkFromBatch(): ArrayBuffer {
    if (!this.currentBatch) {
      throw new Error("No current batch available for slicing");
    }

    // 🆕 直接基于offset在batch中的位置计算，避免batch内索引计算错误
    const offsetInBatch = this.totalFileOffset - this.currentBatchStartOffset;
    const remainingInBatch = this.currentBatch.byteLength - offsetInBatch;
    const chunkSize = Math.min(this.NETWORK_CHUNK_SIZE, remainingInBatch);

    if (chunkSize <= 0) {
      throw new Error("Invalid chunk size calculated");
    }

    const networkChunk = this.currentBatch.slice(
      offsetInBatch,
      offsetInBatch + chunkSize
    );

    // Delete frequent slice logs, only output when needed
    return networkChunk;
  }

  /**
   * 📊 Calculate global network chunk index
   * 🔧 Simplified logic: directly calculate based on file offset to avoid batch boundary errors
   */
  private calculateGlobalChunkIndex(): number {
    // 🎯 核心修复：直接基于当前文件偏移量计算chunk索引，避免复杂的batch计算
    // 这确保了与接收端ReceptionConfig.getChunkIndexFromOffset()完全一致的计算逻辑
    return Math.floor(this.totalFileOffset / this.NETWORK_CHUNK_SIZE);
  }

  /**
   * 📈 Calculate total network chunk count
   */
  private calculateTotalNetworkChunks(): number {
    return Math.ceil(this.totalFileSize / this.NETWORK_CHUNK_SIZE);
  }

  /**
   * ⏭️ Update current processing state
   */
  private updateChunkState(chunk: ArrayBuffer): void {
    this.currentChunkIndexInBatch++;
    this.totalFileOffset += chunk.byteLength;

    // Check if end of file has been reached
    if (this.totalFileOffset >= this.totalFileSize) {
      this.isFinished = true;
    }
  }

  /**
   * 🏁 Check if this is the last network chunk
   */
  private isLastNetworkChunk(chunk: ArrayBuffer): boolean {
    return this.totalFileOffset + chunk.byteLength >= this.totalFileSize;
  }

  /**
   * 📊 Get reading progress information
   */
  public getProgress(): {
    readBytes: number;
    totalBytes: number;
    progressPercent: number;
    currentBatchInfo?: {
      batchStartOffset: number;
      batchSize: number;
      chunkIndex: number;
      totalChunks: number;
    };
  } {
    const progressPercent =
      this.totalFileSize > 0
        ? (this.totalFileOffset / this.totalFileSize) * 100
        : 0;

    const result = {
      readBytes: this.totalFileOffset,
      totalBytes: this.totalFileSize,
      progressPercent,
    } as any;

    if (this.currentBatch) {
      result.currentBatchInfo = {
        batchStartOffset: this.currentBatchStartOffset,
        batchSize: this.currentBatch.byteLength,
        chunkIndex: this.currentChunkIndexInBatch,
        totalChunks: Math.ceil(
          this.currentBatch.byteLength / this.NETWORK_CHUNK_SIZE
        ),
      };
    }

    return result;
  }

  /**
   * 🔄 Reset reader state (for restarting reading)
   */
  public reset(startOffset: number = 0): void {
    this.totalFileOffset = startOffset;
    this.isFinished = false;
    this.isReading = false;
    this.currentBatch = null;
    // 🔧 修复：reset时也要正确设置currentBatchStartOffset
    this.currentBatchStartOffset = startOffset;
    this.currentChunkIndexInBatch = 0; // 重置为0，loadNextBatch会重新计算

    if (developmentEnv === "development") {
      postLogToBackend(
        `[DEBUG] 🔄 StreamingFileReader reset - startOffset:${startOffset}`
      );
    }
  }

  /**
   * 🧹 Cleanup and release resources
   */
  public cleanup(): void {
    // Abort ongoing file reading
    if (this.isReading) {
      this.fileReader.abort();
    }

    // Clean up memory
    this.currentBatch = null;
    this.isFinished = true;
    this.isReading = false;
  }

  /**
   * 🔍 Get debug information
   */
  public getDebugInfo() {
    return {
      fileName: this.file.name,
      fileSize: this.totalFileSize,
      currentOffset: this.totalFileOffset,
      isFinished: this.isFinished,
      isReading: this.isReading,
      hasBatch: !!this.currentBatch,
      batchOffset: this.currentBatchStartOffset,
      chunkInBatch: this.currentChunkIndexInBatch,
      globalChunkIndex: this.calculateGlobalChunkIndex(),
      totalChunks: this.calculateTotalNetworkChunks(),
    };
  }
}
