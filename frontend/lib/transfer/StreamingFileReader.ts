import { CustomFile } from "@/types/webrtc";
import { TransferConfig } from "./TransferConfig";
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
  private isFinished = false;
  private isReading = false; // Prevent concurrent reading

  constructor(file: CustomFile, startOffset: number = 0) {
    this.file = file;
    this.totalFileSize = file.size;
    this.totalFileOffset = startOffset;
    // 🔧 修复：续传时currentBatchStartOffset应该从startOffset开始
    this.currentBatchStartOffset = startOffset;
    this.fileReader = new FileReader();

    if (developmentEnv === "development") {
      postLogToBackend(
        `[DEBUG] 📖 StreamingFileReader created - file: ${file.name}, size: ${(
          this.totalFileSize /
          1024 /
          1024
        ).toFixed(1)}MB`
      );
      // 🔍 调试续传初始化
      const expectedGlobalChunk = Math.floor(
        startOffset / this.NETWORK_CHUNK_SIZE
      );
      postLogToBackend(
        `[DEBUG-RESUME] 🏗️ StreamingFileReader created - totalFileOffset:${this.totalFileOffset}, currentBatchStartOffset:${this.currentBatchStartOffset}, expectedGlobalChunk:${expectedGlobalChunk}`
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

    // Delete frequent chunk progress logs

    // 🔍 调试chunk发送 (前5个和最后5个chunks)
    const totalChunks = this.calculateTotalNetworkChunks();
    const isLastFew = globalChunkIndex >= (totalChunks - 5);
    if (developmentEnv === "development" && (globalChunkIndex <= 5 || isLastFew || isLast)) {
      postLogToBackend(
        `[DEBUG-CHUNKS] 📤 Send chunk #${globalChunkIndex}/${totalChunks} - size:${networkChunk.byteLength}, isLast:${isLast}, fileOffset:${this.totalFileOffset - networkChunk.byteLength}`
      );
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

      // 🔧 修复：如果不是从batch边界开始，说明是续传情况，需要计算正确的batch内索引
      if (batchStartOffset % this.BATCH_SIZE !== 0) {
        // 续传情况：不是从batch边界开始
        const globalChunkIndex = Math.floor(
          batchStartOffset / this.NETWORK_CHUNK_SIZE
        );
        this.currentChunkIndexInBatch =
          globalChunkIndex % this.CHUNKS_PER_BATCH;
      } else {
        // 正常情况：从batch边界开始
        this.currentChunkIndexInBatch = 0;
      }

      // Only output batch reading logs in development environment
      if (developmentEnv === "development") {
        const totalTime = performance.now() - startTime;
        const speedMBps = batchSize / 1024 / 1024 / (totalTime / 1000);
        postLogToBackend(
          `[DEBUG] 📖 BATCH_READ - size: ${(batchSize / 1024 / 1024).toFixed(
            1
          )}MB, time: ${totalTime.toFixed(0)}ms, speed: ${speedMBps.toFixed(
            1
          )}MB/s`
        );
        // 🔍 调试batch内索引设置
        postLogToBackend(
          `[DEBUG-RESUME] 📖 BATCH loaded - batchStartOffset:${batchStartOffset}, currentChunkIndexInBatch:${
            this.currentChunkIndexInBatch
          }, isResume:${batchStartOffset % this.BATCH_SIZE !== 0}`
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
   */
  private sliceNetworkChunkFromBatch(): ArrayBuffer {
    if (!this.currentBatch) {
      throw new Error("No current batch available for slicing");
    }

    const chunkStartInBatch =
      this.currentChunkIndexInBatch * this.NETWORK_CHUNK_SIZE;
    const remainingInBatch = this.currentBatch.byteLength - chunkStartInBatch;
    const chunkSize = Math.min(this.NETWORK_CHUNK_SIZE, remainingInBatch);

    if (chunkSize <= 0) {
      throw new Error("Invalid chunk size calculated");
    }

    const networkChunk = this.currentBatch.slice(
      chunkStartInBatch,
      chunkStartInBatch + chunkSize
    );

    // Delete frequent slice logs, only output when needed
    return networkChunk;
  }

  /**
   * 📊 Calculate global network chunk index
   */
  private calculateGlobalChunkIndex(): number {
    const batchesBefore = Math.floor(
      this.currentBatchStartOffset / this.BATCH_SIZE
    );
    const chunksInPreviousBatches = batchesBefore * this.CHUNKS_PER_BATCH;
    const result = chunksInPreviousBatches + this.currentChunkIndexInBatch;

    // 🔍 调试chunk索引计算
    if (
      developmentEnv === "development" &&
      this.currentChunkIndexInBatch <= 5
    ) {
      postLogToBackend(
        `[DEBUG-RESUME] 🧮 calculateGlobalChunkIndex - batchStartOffset:${this.currentBatchStartOffset}, batchesBefore:${batchesBefore}, chunksInPrev:${chunksInPreviousBatches}, chunkInBatch:${this.currentChunkIndexInBatch}, result:${result}`
      );
    }

    return result;
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
