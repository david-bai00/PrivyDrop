/**
 * 🚀 Chunk range calculation utilities
 * Provides unified chunk calculation logic to ensure consistency between sender and receiver
 */

export class ChunkRangeCalculator {
  /**
   * Calculate chunk range for a file with given parameters
   * This method ensures both sender and receiver use identical calculation logic
   */
  static getChunkRange(fileSize: number, startOffset: number, chunkSize: number) {
    // Calculate starting chunk index
    const startChunk = Math.floor(startOffset / chunkSize);
    
    // Calculate ending chunk index based on the last byte of the file
    const lastByteIndex = fileSize - 1;
    const endChunk = Math.floor(lastByteIndex / chunkSize);
    
    // Calculate total chunks to be sent/received (from startChunk to endChunk inclusive)
    const totalChunks = endChunk - startChunk + 1;
    
    // Calculate absolute total chunks in the entire file
    const absoluteTotalChunks = Math.ceil(fileSize / chunkSize);
    
    return { 
      startChunk,           // First chunk index to process
      endChunk,            // Last chunk index to process  
      totalChunks,         // Number of chunks to process (for resume transfers)
      absoluteTotalChunks  // Total chunks in the entire file
    };
  }

  /**
   * Calculate expected chunks count for resume transfer
   * Identical to ReceptionConfig.calculateExpectedChunks()
   */
  static calculateExpectedChunks(fileSize: number, startOffset: number, chunkSize: number): number {
    return Math.ceil((fileSize - startOffset) / chunkSize);
  }

  /**
   * Get chunk index from file offset
   * Identical to ReceptionConfig.getChunkIndexFromOffset()
   */
  static getChunkIndexFromOffset(offset: number, chunkSize: number): number {
    return Math.floor(offset / chunkSize);
  }

  /**
   * Get file offset from chunk index
   * Identical to ReceptionConfig.getOffsetFromChunkIndex()
   */
  static getOffsetFromChunkIndex(chunkIndex: number, chunkSize: number): number {
    return chunkIndex * chunkSize;
  }

  /**
   * Validate chunk index within expected range
   */
  static isChunkIndexValid(
    chunkIndex: number, 
    startOffset: number, 
    fileSize: number, 
    chunkSize: number
  ): boolean {
    const range = this.getChunkRange(fileSize, startOffset, chunkSize);
    return chunkIndex >= range.startChunk && chunkIndex <= range.endChunk;
  }

  /**
   * Calculate relative chunk index from absolute chunk index
   * Used by receiver to map sender's absolute index to local array index
   */
  static getRelativeChunkIndex(
    absoluteChunkIndex: number, 
    startOffset: number, 
    chunkSize: number
  ): number {
    const startChunkIndex = this.getChunkIndexFromOffset(startOffset, chunkSize);
    return absoluteChunkIndex - startChunkIndex;
  }
}
