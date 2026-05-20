import { ReceptionConfig } from "./ReceptionConfig";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ scope: "Receive.StreamingFileWriter" });

/**
 * 🚀 Strict Sequential Buffering Writer - Optimizes large file disk I/O performance
 */
export class SequencedDiskWriter {
  private writeQueue = new Map<number, ArrayBuffer>();
  private nextWriteIndex = 0;
  private readonly maxBufferSize: number;
  private readonly stream: FileSystemWritableFileStream;
  private totalWritten = 0;
  private writeChain: Promise<void> = Promise.resolve();
  private lastWriteTask: Promise<void> = Promise.resolve();

  constructor(stream: FileSystemWritableFileStream, startIndex: number = 0) {
    this.stream = stream;
    this.nextWriteIndex = startIndex;
    this.maxBufferSize = ReceptionConfig.BUFFER_CONFIG.MAX_BUFFER_SIZE;
  }

  /**
   * Write a chunk, automatically managing order and buffering
   */
  async writeChunk(chunkIndex: number, chunk: ArrayBuffer): Promise<void> {
    const writeTask = this.writeChain.then(() =>
      this.writeChunkInternal(chunkIndex, chunk)
    );
    this.lastWriteTask = writeTask;
    this.writeChain = writeTask.catch(() => {});
    return writeTask;
  }

  async waitForIdle(): Promise<void> {
    await this.lastWriteTask;
  }

  private async writeChunkInternal(
    chunkIndex: number,
    chunk: ArrayBuffer
  ): Promise<void> {
    // Debug writeChunk calls
    if (
      ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING &&
      (chunkIndex <= 5 || chunkIndex === this.nextWriteIndex)
    ) {
      logger.debug({
        event: "write_chunk_called",
        context: {
          chunkIndex,
          expectedIndex: this.nextWriteIndex,
          matchesExpected: chunkIndex === this.nextWriteIndex,
        },
      });
    }

    // 1. If it is the expected next chunk, write immediately
    if (chunkIndex === this.nextWriteIndex) {
      await this.flushSequentialChunks(chunk);
      return;
    }

    // 2. If it's a future chunk, buffer it
    if (chunkIndex > this.nextWriteIndex) {
      if (this.writeQueue.size < this.maxBufferSize) {
        this.writeQueue.set(chunkIndex, chunk);
      } else {
        // Buffer full, forcing processing of the earliest chunk to free up space
        await this.forceFlushOldest();
        this.writeQueue.set(chunkIndex, chunk);
      }
      return;
    }

    // 3. If the chunk is expired, log a warning but ignore (already written)
    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      logger.warn({
        event: "duplicate_chunk_ignored",
        context: {
          chunkIndex,
          nextWriteIndex: this.nextWriteIndex,
        },
      });
    }
  }

  /**
   * Write current chunk and attempt to sequentially write subsequent chunks
   */
  private async flushSequentialChunks(firstChunk: ArrayBuffer): Promise<void> {
    let flushCount = 0;

    try {
      // Write current chunk
      await this.stream.write(firstChunk);
      this.totalWritten += firstChunk.byteLength;

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "disk_write_completed",
          context: {
            chunkIndex: this.nextWriteIndex,
            byteLength: firstChunk.byteLength,
            totalWritten: this.totalWritten,
          },
        });
      }

      this.nextWriteIndex++;

      // Try to sequentially write chunks from buffer
      while (this.writeQueue.has(this.nextWriteIndex)) {
        const chunk = this.writeQueue.get(this.nextWriteIndex)!;
        await this.stream.write(chunk);
        this.totalWritten += chunk.byteLength;
        this.writeQueue.delete(this.nextWriteIndex);

        flushCount++;
        this.nextWriteIndex++;
      }
    } catch (error) {
      // Defensive handling: If stream is closed, silently ignore
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("closing writable stream") ||
        errorMessage.includes("stream is closed")
      ) {
        logger.info({
          event: "stream_closed_during_write",
        });
        return;
      }
      // Re-throw other types of errors
      throw error;
    }

    if (flushCount > 0 && ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      logger.debug({
        event: "sequential_flush_completed",
        context: {
          flushCount,
          nextWriteIndex: this.nextWriteIndex,
          queueSize: this.writeQueue.size,
        },
      });
    }
  }

  /**
   * Get the next expected write index
   */
  get expectedIndex(): number {
    return this.nextWriteIndex;
  }

  /**
   * Force flush the earliest chunk to release buffer space
   */
  private async forceFlushOldest(): Promise<void> {
    try {
      if (this.writeQueue.size === 0) return;

      const oldestIndex = Math.min(...Array.from(this.writeQueue.keys()));
      const chunk = this.writeQueue.get(oldestIndex)!;

      // Use seek to write at the correct position (fallback handling)
      const fileOffset = ReceptionConfig.getOffsetFromChunkIndex(oldestIndex);
      await this.stream.seek(fileOffset);
      await this.stream.write(chunk);
      this.writeQueue.delete(oldestIndex);

      // Return to current position
      const currentOffset = ReceptionConfig.getOffsetFromChunkIndex(this.nextWriteIndex);
      await this.stream.seek(currentOffset);
    } catch (error) {
      // Defensive handling: If stream is closed, silently ignore
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("closing writable stream") ||
        errorMessage.includes("stream is closed")
      ) {
        logger.info({
          event: "stream_closed_during_forced_flush",
        });
        return;
      }
      // Re-throw other types of errors
      throw error;
    }
  }

  /**
   * Get buffer status
   */
  getBufferStatus(): {
    queueSize: number;
    nextIndex: number;
    totalWritten: number;
  } {
    return {
      queueSize: this.writeQueue.size,
      nextIndex: this.nextWriteIndex,
      totalWritten: this.totalWritten,
    };
  }

  /**
   * Close and clean up resources
   */
  async close(): Promise<void> {
    await this.waitForIdle();

    try {
      // 🔧 修复：确保以正确的WriteParams格式写入剩余chunks
      const remainingIndexes = Array.from(this.writeQueue.keys()).sort(
        (a, b) => a - b
      );
      
      if (remainingIndexes.length > 0) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          logger.debug({
            event: "remaining_chunks_flushing",
            context: {
              remainingCount: remainingIndexes.length,
              remainingIndexes,
            },
          });
        }
        
        for (const chunkIndex of remainingIndexes) {
          const chunk = this.writeQueue.get(chunkIndex)!;
          const fileOffset = ReceptionConfig.getOffsetFromChunkIndex(chunkIndex);
          
          // 🔧 修复：使用正确的WriteParams格式
          await this.stream.seek(fileOffset);
          
          // 确保chunk是有效的ArrayBuffer
          if (!(chunk instanceof ArrayBuffer) || chunk.byteLength === 0) {
            if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
              logger.warn({
                event: "invalid_chunk_skipped_during_final_flush",
                context: {
                  chunkIndex,
                  chunkType: Object.prototype.toString.call(chunk),
                  chunkSize: chunk.byteLength,
                },
              });
            }
            continue;
          }
          
          // 使用标准WriteParams格式写入
          await this.stream.write({
            type: "write",
            data: chunk
          });
          
          if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
            logger.debug({
              event: "final_flush_chunk_written",
              context: {
                chunkIndex,
                chunkSize: chunk.byteLength,
              },
            });
          }
        }
      }
    } catch (error) {
      // Enhanced error handling with specific error types
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "final_flush_failed",
          context: { errorMessage },
        });
      }
      
      if (
        errorMessage.includes("closing writable stream") ||
        errorMessage.includes("stream is closed") ||
        errorMessage.includes("The stream is not in a state that permits this operation")
      ) {
        logger.info({
          event: "stream_closed_during_final_flush",
        });
      } else {
        logger.warn({
          event: "unexpected_final_flush_error",
          context: { errorMessage },
        });
        throw error;
      }
    } finally {
      // 无论如何都要清理队列
      this.writeQueue.clear();
    }
  }
}

/**
 * 🚀 Streaming file writer
 * Manages disk file creation, directory structure, and streaming writes
 */
export class StreamingFileWriter {
  private saveDirectory: FileSystemDirectoryHandle | null = null;

  constructor(saveDirectory?: FileSystemDirectoryHandle) {
    this.saveDirectory = saveDirectory || null;
  }

  /**
   * Set save directory
   */
  setSaveDirectory(directory: FileSystemDirectoryHandle): void {
    this.saveDirectory = directory;
  }

  /**
   * Create disk write stream for a file
   */
  async createWriteStream(
    fileName: string,
    fullPath: string,
    offset: number = 0
  ): Promise<{
    fileHandle: FileSystemFileHandle;
    writeStream: FileSystemWritableFileStream;
    sequencedWriter: SequencedDiskWriter;
  }> {
    if (!this.saveDirectory) {
      throw new Error("Save directory not set");
    }

    try {
      const folderHandle = await this.createFolderStructure(fullPath);
      const fileHandle = await folderHandle.getFileHandle(fileName, {
        create: true,
      });

      // Use keepExistingData: true to append
      const writeStream = await fileHandle.createWritable({
        keepExistingData: true,
      });

      // Seek to the offset to start writing from there
      await writeStream.seek(offset);

      // Create strictly sequential write manager
      const startChunkIndex = ReceptionConfig.getChunkIndexFromOffset(offset);
      const sequencedWriter = new SequencedDiskWriter(writeStream, startChunkIndex);

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "sequenced_writer_created",
          context: {
            startChunkIndex,
            offset,
            chunkSize: ReceptionConfig.FILE_CONFIG.CHUNK_SIZE,
          },
        });
      }

      return { fileHandle, writeStream, sequencedWriter };
    } catch (err) {
      throw new Error(`Failed to create file on disk: ${err}`);
    }
  }

  /**
   * Check if partial file exists and get its size
   */
  async getPartialFileSize(fileName: string, fullPath: string): Promise<number> {
    if (!this.saveDirectory) {
      return 0;
    }

    try {
      const folderHandle = await this.createFolderStructure(fullPath);
      const fileHandle = await folderHandle.getFileHandle(fileName, {
        create: false,
      });
      const file = await fileHandle.getFile();
      return file.size;
    } catch {
      // File does not exist
      return 0;
    }
  }

  /**
   * Create folder structure based on full path
   */
  private async createFolderStructure(
    fullPath: string
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.saveDirectory) {
      throw new Error("Save directory not set");
    }

    const parts = fullPath.split("/");
    parts.pop(); // Remove filename

    let currentDir = this.saveDirectory;
    for (const part of parts) {
      if (part) {
        currentDir = await currentDir.getDirectoryHandle(part, {
          create: true,
        });
      }
    }
    return currentDir;
  }

  /**
   * Finalize file write and close streams
   */
  async finalizeWrite(
    sequencedWriter: SequencedDiskWriter,
    writeStream: FileSystemWritableFileStream,
    fileName: string
  ): Promise<void> {
    try {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "file_finalization_started",
          context: { fileName },
        });
      }

      // First close the strict sequential writing manager (flush all buffers)
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "sequenced_writer_closing",
          context: { fileName },
        });
      }
      await sequencedWriter.close();
      const status = sequencedWriter.getBufferStatus();
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "sequenced_writer_closed",
          context: {
            fileName,
            totalWritten: status.totalWritten,
            finalQueueSize: status.queueSize,
          },
        });
      }

      // Then close the file stream
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "write_stream_closing",
          context: { fileName },
        });
      }
      await writeStream.close();
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "write_stream_closed",
          context: { fileName },
        });
      }

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.debug({
          event: "large_file_finalized",
          context: { fileName },
        });
      }
    } catch (error) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "file_finalization_failed",
          context: { fileName, error },
        });
      }
      throw new Error(`Error finalizing large file: ${error}`);
    }
  }

  /**
   * Check if save directory is available
   */
  hasSaveDirectory(): boolean {
    return !!this.saveDirectory;
  }

  /**
   * Get save directory
   */
  getSaveDirectory(): FileSystemDirectoryHandle | null {
    return this.saveDirectory;
  }
}
