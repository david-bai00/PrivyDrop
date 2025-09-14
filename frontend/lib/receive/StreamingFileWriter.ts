import { ReceptionConfig } from "./ReceptionConfig";
import { postLogToBackend } from "@/app/config/api";

const developmentEnv = process.env.NODE_ENV;

/**
 * 🚀 Strict Sequential Buffering Writer - Optimizes large file disk I/O performance
 */
export class SequencedDiskWriter {
  private writeQueue = new Map<number, ArrayBuffer>();
  private nextWriteIndex = 0;
  private readonly maxBufferSize: number;
  private readonly stream: FileSystemWritableFileStream;
  private totalWritten = 0;

  constructor(stream: FileSystemWritableFileStream, startIndex: number = 0) {
    this.stream = stream;
    this.nextWriteIndex = startIndex;
    this.maxBufferSize = ReceptionConfig.BUFFER_CONFIG.MAX_BUFFER_SIZE;
  }

  /**
   * Write a chunk, automatically managing order and buffering
   */
  async writeChunk(chunkIndex: number, chunk: ArrayBuffer): Promise<void> {
    // Debug writeChunk calls
    if (
      ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING &&
      (chunkIndex <= 5 || chunkIndex === this.nextWriteIndex)
    ) {
      postLogToBackend(
        `[DEBUG-RESUME] 🎯 WriteChunk called - received:${chunkIndex}, expected:${
          this.nextWriteIndex
        }, match:${chunkIndex === this.nextWriteIndex}`
      );
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
      postLogToBackend(
        `[DEBUG] ⚠️ DUPLICATE chunk #${chunkIndex} ignored (already written #${this.nextWriteIndex})`
      );
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
        postLogToBackend(
          `[DEBUG] ✓ DISK_WRITE chunk #${this.nextWriteIndex} - ${firstChunk.byteLength} bytes, total: ${this.totalWritten}`
        );
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
        console.log(
          `[SequencedDiskWriter] Stream closed during write - ignoring remaining chunks`
        );
        return;
      }
      // Re-throw other types of errors
      throw error;
    }

    if (flushCount > 0 && ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      postLogToBackend(
        `[DEBUG] 🔥 SEQUENTIAL_FLUSH ${flushCount} chunks, now at #${this.nextWriteIndex}, queue: ${this.writeQueue.size}`
      );
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
        console.log(
          `[SequencedDiskWriter] Stream closed during write - ignoring remaining chunks`
        );
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
    try {
      // Try to flush all remaining chunks
      const remainingIndexes = Array.from(this.writeQueue.keys()).sort(
        (a, b) => a - b
      );
      for (const chunkIndex of remainingIndexes) {
        const chunk = this.writeQueue.get(chunkIndex)!;
        const fileOffset = ReceptionConfig.getOffsetFromChunkIndex(chunkIndex);
        await this.stream.seek(fileOffset);
        await this.stream.write(chunk);
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          postLogToBackend(
            `[DEBUG] 💾 FINAL_FLUSH chunk #${chunkIndex} at cleanup`
          );
        }
      }
    } catch (error) {
      // Defensive handling: If stream is not writable during close, handle silently
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("closing writable stream") ||
        errorMessage.includes("stream is closed")
      ) {
        console.log(
          `[SequencedDiskWriter] Stream closed during final flush - data may be incomplete`
        );
      } else {
        console.warn(
          `[SequencedDiskWriter] Error during final flush:`,
          errorMessage
        );
        throw error;
      }
    }

    this.writeQueue.clear();
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
        postLogToBackend(
          `[DEBUG] 📢 SEQUENCED_WRITER created - startIndex: ${startChunkIndex}, offset: ${offset}`
        );
        postLogToBackend(
          `[DEBUG-RESUME] 🎯 SequencedWriter expects - startIndex:${startChunkIndex}, offset:${offset}, calculatedFrom:${offset}/65536`
        );
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
        postLogToBackend(
          `[DEBUG-FINALIZE] 🚀 Starting finalization for ${fileName}`
        );
      }

      // First close the strict sequential writing manager (flush all buffers)
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(`[DEBUG-FINALIZE] Closing SequencedWriter...`);
      }
      await sequencedWriter.close();
      const status = sequencedWriter.getBufferStatus();
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-FINALIZE] 💾 SEQUENCED_WRITER closed - totalWritten: ${status.totalWritten}, finalQueue: ${status.queueSize}`
        );
      }

      // Then close the file stream
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-FINALIZE] About to close writeStream for ${fileName}`
        );
      }
      await writeStream.close();
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(`[DEBUG-FINALIZE] ✅ WriteStream closed successfully`);
      }

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-FINALIZE] ✅ LARGE_FILE finalized successfully - ${fileName}`
        );
      }
    } catch (error) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-FINALIZE] ❌ Error during finalization: ${error}`
        );
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