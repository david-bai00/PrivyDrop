import { EmbeddedChunkMeta } from "@/types/webrtc";
import { ReceptionConfig } from "./ReceptionConfig";
import { postLogToBackend } from "@/app/config/api";

const developmentEnv = process.env.NODE_ENV;

/**
 * 🚀 Chunk processing result interface
 */
export interface ChunkProcessingResult {
  chunkMeta: EmbeddedChunkMeta;
  chunkData: ArrayBuffer;
  absoluteChunkIndex: number;
  relativeChunkIndex: number;
}

/**
 * 🚀 Chunk processor
 * Handles all data chunk processing, format conversion, and parsing
 */
export class ChunkProcessor {
  /**
   * Convert various binary data formats to ArrayBuffer
   * Supports Blob, Uint8Array, and other formats for Firefox compatibility
   */
  async convertToArrayBuffer(data: any): Promise<ArrayBuffer | null> {
    const originalType = Object.prototype.toString.call(data);

    if (data instanceof ArrayBuffer) {
      return data;
    } else if (data instanceof Blob) {
      try {
        const arrayBuffer = await data.arrayBuffer();
        if (data.size !== arrayBuffer.byteLength) {
          if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
            postLogToBackend(
              `[DEBUG] ⚠️ Blob size mismatch: ${data.size}→${arrayBuffer.byteLength}`
            );
          }
        }
        return arrayBuffer;
      } catch (error) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          postLogToBackend(`[DEBUG] ❌ Blob conversion failed: ${error}`);
        }
        return null;
      }
    } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
      try {
        const uint8Array =
          data instanceof Uint8Array
            ? data
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const newArrayBuffer = new ArrayBuffer(uint8Array.length);
        new Uint8Array(newArrayBuffer).set(uint8Array);
        return newArrayBuffer;
      } catch (error) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          postLogToBackend(`[DEBUG] ❌ TypedArray conversion failed: ${error}`);
        }
        return null;
      }
    } else {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG] ❌ Unknown data type: ${Object.prototype.toString.call(
            data
          )}`
        );
      }
      return null;
    }
  }

  /**
   * Parse embedded chunk packet
   * Format: [4 bytes length] + [JSON metadata] + [actual chunk data]
   */
  parseEmbeddedChunkPacket(arrayBuffer: ArrayBuffer): {
    chunkMeta: EmbeddedChunkMeta;
    chunkData: ArrayBuffer;
  } | null {
    try {
      // 1. Check minimum packet length
      if (arrayBuffer.byteLength < ReceptionConfig.VALIDATION_CONFIG.MIN_PACKET_SIZE) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          postLogToBackend(
            `[DEBUG] ❌ Invalid embedded packet - too small: ${arrayBuffer.byteLength}`
          );
        }
        return null;
      }

      // 2. Read metadata length (4 bytes)
      const lengthView = new Uint32Array(arrayBuffer, 0, 1);
      const metaLength = lengthView[0];

      // 3. Verify packet integrity
      const expectedTotalLength = 4 + metaLength;
      if (arrayBuffer.byteLength < expectedTotalLength) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          postLogToBackend(
            `[DEBUG] ❌ Incomplete embedded packet - expected: ${expectedTotalLength}, got: ${arrayBuffer.byteLength}`
          );
        }
        return null;
      }

      // 4. Extract metadata section
      const metaBytes = new Uint8Array(arrayBuffer, 4, metaLength);
      const metaJson = new TextDecoder().decode(metaBytes);
      const chunkMeta: EmbeddedChunkMeta = JSON.parse(metaJson);

      // 5. Extract actual chunk data section
      const chunkDataStart = 4 + metaLength;
      const chunkData = arrayBuffer.slice(chunkDataStart);

      // 6. Verify chunk data size
      if (chunkData.byteLength !== chunkMeta.chunkSize) {
        if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
          postLogToBackend(
            `[DEBUG] ⚠️ Chunk size mismatch - meta: ${chunkMeta.chunkSize}, actual: ${chunkData.byteLength}`
          );
        }
      }

      return { chunkMeta, chunkData };
    } catch (error) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG] ❌ Failed to parse embedded packet: ${error}`
        );
      }
      return null;
    }
  }

  /**
   * Process received chunk and calculate indices
   */
  processReceivedChunk(
    chunkMeta: EmbeddedChunkMeta,
    chunkData: ArrayBuffer,
    initialOffset: number
  ): ChunkProcessingResult | null {
    // Calculate indices
    const absoluteChunkIndex = chunkMeta.chunkIndex; // Sender's absolute index
    const startChunkIndex = ReceptionConfig.getChunkIndexFromOffset(initialOffset); // Resume start index
    const relativeChunkIndex = absoluteChunkIndex - startChunkIndex; // Relative index in chunks array

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING && absoluteChunkIndex <= 970) {
      postLogToBackend(
        `[DEBUG-CHUNKS] Index mapping - absolute:${absoluteChunkIndex}, start:${startChunkIndex}, relative:${relativeChunkIndex}`
      );
    }

    return {
      chunkMeta,
      chunkData,
      absoluteChunkIndex,
      relativeChunkIndex,
    };
  }

  /**
   * Validate chunk against expected parameters
   */
  validateChunk(
    chunkMeta: EmbeddedChunkMeta,
    expectedFileId: string,
    expectedChunksCount: number,
    initialOffset: number
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Verify fileId match
    if (chunkMeta.fileId !== expectedFileId) {
      errors.push(`FileId mismatch - expected: ${expectedFileId}, got: ${chunkMeta.fileId}`);
    }

    // Validate chunk size
    if (chunkMeta.chunkSize <= 0) {
      errors.push(`Invalid chunk size: ${chunkMeta.chunkSize}`);
    }

    // Check if chunk index is reasonable
    if (chunkMeta.chunkIndex < 0) {
      errors.push(`Invalid chunk index: ${chunkMeta.chunkIndex}`);
    }

    // Validate total chunks (with resume consideration)
    const startChunkIndex = ReceptionConfig.getChunkIndexFromOffset(initialOffset);
    const calculatedExpected = chunkMeta.totalChunks - startChunkIndex;
    
    if (chunkMeta.totalChunks !== expectedChunksCount && calculatedExpected !== expectedChunksCount) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG-CHUNKS] Chunk count info - fileTotal: ${chunkMeta.totalChunks}, currentExpected: ${expectedChunksCount}, calculatedExpected: ${calculatedExpected}, startChunk: ${startChunkIndex}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if chunk index is within valid range
   */
  isChunkIndexValid(
    relativeChunkIndex: number,
    expectedChunksCount: number
  ): boolean {
    return relativeChunkIndex >= 0 && relativeChunkIndex < expectedChunksCount;
  }

  /**
   * Log chunk processing details (for debugging)
   */
  logChunkDetails(
    result: ChunkProcessingResult,
    expectedChunksCount: number,
    writerExpectedIndex?: number
  ): void {
    if (!ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      return;
    }

    const { chunkMeta, absoluteChunkIndex, relativeChunkIndex } = result;
    const lastFewChunks = relativeChunkIndex >= expectedChunksCount - 5;

    if (absoluteChunkIndex <= 970 || lastFewChunks) {
      postLogToBackend(
        `[DEBUG-CHUNKS] 📦 Chunk #${absoluteChunkIndex} received - relative:${relativeChunkIndex}, size:${chunkMeta.chunkSize}${
          writerExpectedIndex !== undefined ? `, writerExpects:${writerExpectedIndex}` : ''
        }, isLastFew:${lastFewChunks}`
      );
    }
  }

  /**
   * Calculate completion statistics
   */
  calculateCompletionStats(
    chunks: (ArrayBuffer | null)[],
    expectedChunksCount: number,
    expectedSize: number
  ): {
    sequencedCount: number;
    currentTotalSize: number;
    isSequencedComplete: boolean;
    sizeComplete: boolean;
    isDataComplete: boolean;
  } {
    // Calculate current actual total received size
    const currentTotalSize = chunks.reduce((sum, chunk) => {
      return sum + (chunk instanceof ArrayBuffer ? chunk.byteLength : 0);
    }, 0);

    // Count sequentially received chunks
    let sequencedCount = 0;
    for (let i = 0; i < expectedChunksCount; i++) {
      if (chunks[i] instanceof ArrayBuffer) {
        sequencedCount++;
      }
    }

    const isSequencedComplete = sequencedCount === expectedChunksCount;
    const sizeComplete = currentTotalSize >= expectedSize;
    const isDataComplete = isSequencedComplete && sizeComplete;

    return {
      sequencedCount,
      currentTotalSize,
      isSequencedComplete,
      sizeComplete,
      isDataComplete,
    };
  }

  /**
   * Log completion check details (for debugging)
   */
  logCompletionCheck(
    fileName: string,
    stats: {
      sequencedCount: number;
      expectedChunksCount: number;
      currentTotalSize: number;
      expectedSize: number;
      isDataComplete: boolean;
    },
    chunks: (ArrayBuffer | null)[],
    initialOffset: number
  ): void {
    if (!ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      return;
    }

    const { sequencedCount, expectedChunksCount, currentTotalSize, expectedSize, isDataComplete } = stats;

    // Only log at key moments to reduce noise
    if (
      isDataComplete ||
      sequencedCount % ReceptionConfig.DEBUG_CONFIG.PROGRESS_LOG_INTERVAL === 0 ||
      sequencedCount > expectedChunksCount - 10
    ) {
      // Check last few chunks status
      const lastChunkIndex = expectedChunksCount - 1;
      const lastFewChunks = [];
      const startChunkIndex = ReceptionConfig.getChunkIndexFromOffset(initialOffset);

      for (let i = Math.max(0, lastChunkIndex - 3); i <= lastChunkIndex; i++) {
        const chunk = chunks[i];
        const exists = chunk instanceof ArrayBuffer;
        const size = exists ? (chunk as ArrayBuffer).byteLength : 0;
        const absoluteIndex = startChunkIndex + i;
        lastFewChunks.push(`rel#${i}(abs#${absoluteIndex}):${exists}(${size})`);
      }

      postLogToBackend(`[DEBUG-COMPLETE] Check completion - file:${fileName}`);
      postLogToBackend(
        `[DEBUG-COMPLETE] Chunks: received:${sequencedCount}/${expectedChunksCount}, isSequenceComplete:${stats.sequencedCount === expectedChunksCount}`
      );
      postLogToBackend(
        `[DEBUG-COMPLETE] Size: current:${currentTotalSize}, expected:${expectedSize}, sizeComplete:${currentTotalSize >= expectedSize}, diff:${
          expectedSize - currentTotalSize
        }`
      );
      postLogToBackend(
        `[DEBUG-COMPLETE] LastChunks: ${lastFewChunks.join(", ")}`
      );
      postLogToBackend(
        `[DEBUG-COMPLETE] IsDataComplete: ${isDataComplete}`
      );
    }
  }
}