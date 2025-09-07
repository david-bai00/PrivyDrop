import { CustomFile } from "@/types/webrtc";
import { TransferConfig } from "./TransferConfig";
import { postLogToBackend } from "@/app/config/api";

/**
 * 🚀 网络块信息接口
 */
export interface NetworkChunk {
  chunk: ArrayBuffer | null;
  chunkIndex: number;
  totalChunks: number;
  fileOffset: number;
  isLastChunk: boolean;
}

/**
 * 🚀 高性能流式文件读取器
 * 使用双层缓冲架构：大块批量读取 + 小块网络发送
 * 解决文件读取性能瓶颈问题
 */
export class StreamingFileReader {
  // 配置参数
  private readonly BATCH_SIZE =
    TransferConfig.FILE_CONFIG.CHUNK_SIZE *
    TransferConfig.FILE_CONFIG.BATCH_SIZE; // 32MB批次
  private readonly NETWORK_CHUNK_SIZE =
    TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE; // 64KB网络块
  private readonly CHUNKS_PER_BATCH = this.BATCH_SIZE / this.NETWORK_CHUNK_SIZE; // 512块

  // 文件状态
  private file: File;
  private fileReader: FileReader;
  private totalFileSize: number;

  // 批次缓冲状态
  private currentBatch: ArrayBuffer | null = null; // 当前32MB批次数据
  private currentBatchStartOffset = 0; // 当前批次在文件中的起始位置
  private currentChunkIndexInBatch = 0; // 当前网络块在批次中的索引

  // 全局状态
  private totalFileOffset = 0; // 当前在整个文件中的位置
  private isFinished = false;
  private isReading = false; // 防止并发读取

  constructor(file: CustomFile, startOffset: number = 0) {
    this.file = file;
    this.totalFileSize = file.size;
    this.totalFileOffset = startOffset;
    this.fileReader = new FileReader();

    postLogToBackend(
      `[DEBUG] 📖 StreamingFileReader created - file: ${file.name}, size: ${this.totalFileSize}, startOffset: ${startOffset}`
    );
  }

  /**
   * 🎯 核心方法：获取下一个64KB网络块
   */
  async getNextNetworkChunk(): Promise<NetworkChunk> {
    // 1. 检查是否需要加载新批次
    if (this.needsNewBatch()) {
      await this.loadNextBatch();
    }

    // 2. 检查是否已到文件末尾
    if (this.isFinished || !this.currentBatch) {
      return {
        chunk: null,
        chunkIndex: this.calculateGlobalChunkIndex(),
        totalChunks: this.calculateTotalNetworkChunks(),
        fileOffset: this.totalFileOffset,
        isLastChunk: true,
      };
    }

    // 3. 从当前批次中切片出64KB网络块
    const networkChunk = this.sliceNetworkChunkFromBatch();
    const globalChunkIndex = this.calculateGlobalChunkIndex();
    const isLast = this.isLastNetworkChunk(networkChunk);

    // 4. 更新状态
    this.updateChunkState(networkChunk);

    // 只在关键节点输出日志
    if (globalChunkIndex % 100 === 0 || isLast) {
      postLogToBackend(
        `[PERF] ✂️ CHUNK progress #${globalChunkIndex}/${this.calculateTotalNetworkChunks()} - size: ${
          networkChunk.byteLength
        }, isLast: ${isLast}`
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
   * 🔍 判断是否需要加载新批次
   */
  private needsNewBatch(): boolean {
    return (
      this.currentBatch === null || // 还未加载任何批次
      this.currentChunkIndexInBatch >= this.CHUNKS_PER_BATCH || // 当前批次用完
      this.isCurrentBatchEmpty() // 当前批次已无数据
    );
  }

  /**
   * 🔍 判断当前批次是否为空
   */
  private isCurrentBatchEmpty(): boolean {
    if (!this.currentBatch) return true;

    const usedBytes = this.currentChunkIndexInBatch * this.NETWORK_CHUNK_SIZE;
    return usedBytes >= this.currentBatch.byteLength;
  }

  /**
   * 📥 加载下一个32MB批次到内存
   */
  private async loadNextBatch(): Promise<void> {
    if (this.isReading) {
      // 防止并发读取
      while (this.isReading) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return;
    }

    this.isReading = true;
    const startTime = performance.now();

    try {
      // 1. 清理旧批次内存
      this.currentBatch = null;

      // 2. 计算本次要读取的大小
      const remainingFileSize = this.totalFileSize - this.totalFileOffset;
      const batchSize = Math.min(this.BATCH_SIZE, remainingFileSize);

      if (batchSize <= 0) {
        this.isFinished = true;
        return;
      }

      // 3. 执行大块文件读取
      const sliceStartTime = performance.now();
      const fileSlice = this.file.slice(
        this.totalFileOffset,
        this.totalFileOffset + batchSize
      );
      const sliceTime = performance.now() - sliceStartTime;

      // 4. 异步读取文件数据
      const readStartTime = performance.now();
      this.currentBatch = await this.readFileSlice(fileSlice);
      const readTime = performance.now() - readStartTime;

      this.currentBatchStartOffset = this.totalFileOffset;
      this.currentChunkIndexInBatch = 0;

      const totalTime = performance.now() - startTime;
      const speedMBps = batchSize / 1024 / 1024 / (totalTime / 1000);

      postLogToBackend(
        `[PERF] 📖 BATCH_READ - size: ${(batchSize / 1024 / 1024).toFixed(
          1
        )}MB, total: ${totalTime.toFixed(1)}ms, slice: ${sliceTime.toFixed(
          1
        )}ms, read: ${readTime.toFixed(1)}ms, speed: ${speedMBps.toFixed(
          1
        )}MB/s`
      );
    } catch (error) {
      postLogToBackend(
        `[PERF] ❌ BATCH_READ failed after ${(
          performance.now() - startTime
        ).toFixed(1)}ms: ${error}`
      );
      throw new Error(`Failed to load file batch: ${error}`);
    } finally {
      this.isReading = false;
    }
  }

  /**
   * 📄 执行文件读取操作
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
   * ✂️ 从32MB批次中切片出64KB网络块
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

    // 删除频繁的slice日志，只在需要时输出
    return networkChunk;
  }

  /**
   * 📊 计算全局网络块索引
   */
  private calculateGlobalChunkIndex(): number {
    const batchesBefore = Math.floor(
      this.currentBatchStartOffset / this.BATCH_SIZE
    );
    const chunksInPreviousBatches = batchesBefore * this.CHUNKS_PER_BATCH;
    return chunksInPreviousBatches + this.currentChunkIndexInBatch;
  }

  /**
   * 📈 计算总网络块数量
   */
  private calculateTotalNetworkChunks(): number {
    return Math.ceil(this.totalFileSize / this.NETWORK_CHUNK_SIZE);
  }

  /**
   * ⏭️ 更新当前处理状态
   */
  private updateChunkState(chunk: ArrayBuffer): void {
    this.currentChunkIndexInBatch++;
    this.totalFileOffset += chunk.byteLength;

    // 检查是否到达文件末尾
    if (this.totalFileOffset >= this.totalFileSize) {
      this.isFinished = true;
      postLogToBackend(
        `[DEBUG] 🏁 File reading completed - totalOffset: ${this.totalFileOffset}, fileSize: ${this.totalFileSize}`
      );
    }
  }

  /**
   * 🏁 判断是否为最后一个网络块
   */
  private isLastNetworkChunk(chunk: ArrayBuffer): boolean {
    return this.totalFileOffset + chunk.byteLength >= this.totalFileSize;
  }

  /**
   * 📊 获取读取进度信息
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
   * 🔄 重置读取器状态（用于重新开始读取）
   */
  public reset(startOffset: number = 0): void {
    this.totalFileOffset = startOffset;
    this.isFinished = false;
    this.isReading = false;
    this.currentBatch = null;
    this.currentBatchStartOffset = 0;
    this.currentChunkIndexInBatch = 0;

    postLogToBackend(
      `[DEBUG] 🔄 StreamingFileReader reset - startOffset: ${startOffset}`
    );
  }

  /**
   * 🧹 清理和释放资源
   */
  public cleanup(): void {
    // 中断正在进行的文件读取
    if (this.isReading) {
      this.fileReader.abort();
    }

    // 清理内存
    this.currentBatch = null;
    this.isFinished = true;
    this.isReading = false;

    postLogToBackend(
      `[DEBUG] 🧹 StreamingFileReader cleaned up - file: ${this.file.name}`
    );
  }

  /**
   * 🔍 获取调试信息
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
