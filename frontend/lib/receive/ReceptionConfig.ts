/**
 * 🚀 Reception configuration management
 * Centralized configuration for file reception parameters
 */

export class ReceptionConfig {
  // File size thresholds
  static readonly FILE_CONFIG = {
    LARGE_FILE_THRESHOLD: 1 * 1024 * 1024 * 1024, // 1GB - files larger than this will be saved to disk
    CHUNK_SIZE: 65536, // 64KB standard chunk size
  };

  // Buffer management
  static readonly BUFFER_CONFIG = {
    MAX_BUFFER_SIZE: 100, // Buffer up to 100 chunks (approximately 6.4MB)
    SEQUENTIAL_FLUSH_THRESHOLD: 10, // Start flushing when this many sequential chunks are available
  };

  // Performance and debugging
  static readonly DEBUG_CONFIG = {
    ENABLE_CHUNK_LOGGING: process.env.NODE_ENV === "development",
    ENABLE_PROGRESS_LOGGING: process.env.NODE_ENV === "development",
    PROGRESS_LOG_INTERVAL: 500, // Log progress every N chunks
    COMPLETION_CHECK_INTERVAL: 100, // Check completion every N ms
  };

  // Network and timing
  static readonly NETWORK_CONFIG = {
    FIREFOX_COMPATIBILITY_DELAY: 10, // ms delay for Firefox compatibility
    FINALIZATION_TIMEOUT: 30000, // 30s timeout for file finalization
    GRACEFUL_SHUTDOWN_TIMEOUT: 5000, // 5s timeout for graceful shutdown
  };

  // Validation thresholds
  static readonly VALIDATION_CONFIG = {
    MAX_SIZE_DIFFERENCE_BYTES: 1024, // Allow up to 1KB size difference for validation
    MIN_PACKET_SIZE: 4, // Minimum embedded packet size (4 bytes for length header)
  };

  /**
   * Get chunk index from file offset
   */
  static getChunkIndexFromOffset(offset: number): number {
    return Math.floor(offset / this.FILE_CONFIG.CHUNK_SIZE);
  }

  /**
   * Get file offset from chunk index
   */
  static getOffsetFromChunkIndex(chunkIndex: number): number {
    return chunkIndex * this.FILE_CONFIG.CHUNK_SIZE;
  }

  /**
   * Calculate expected chunks count for file size and offset
   */
  static calculateExpectedChunks(fileSize: number, startOffset: number = 0): number {
    return Math.ceil((fileSize - startOffset) / this.FILE_CONFIG.CHUNK_SIZE);
  }

  /**
   * Calculate total chunks in file
   */
  static calculateTotalChunks(fileSize: number): number {
    return Math.ceil(fileSize / this.FILE_CONFIG.CHUNK_SIZE);
  }

  /**
   * Check if file should be saved to disk
   */
  static shouldSaveToDisk(fileSize: number, hasSaveDirectory: boolean): boolean {
    return hasSaveDirectory || fileSize >= this.FILE_CONFIG.LARGE_FILE_THRESHOLD;
  }
}