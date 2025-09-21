import { CustomFile, fileMetadata } from "@/types/webrtc";
import { ReceptionConfig } from "./ReceptionConfig";
import { postLogToBackend } from "@/app/config/api";

const developmentEnv = process.env.NODE_ENV;

/**
 * 🚀 File assembly result interface
 */
export interface FileAssemblyResult {
  file: CustomFile;
  totalChunkSize: number;
  validChunks: number;
  storeUpdated: boolean;
}

/**
 * 🚀 File assembler
 * Handles in-memory file assembly and validation
 */
export class FileAssembler {
  /**
   * Assemble file from chunks in memory
   */
  async assembleFileFromChunks(
    chunks: (ArrayBuffer | null)[],
    meta: fileMetadata,
    currentFolderName: string | null,
    onFileReceived?: (file: CustomFile) => Promise<void>
  ): Promise<FileAssemblyResult> {
    // Validate and count chunks
    let totalChunkSize = 0;
    let validChunks = 0;

    chunks.forEach((chunk, index) => {
      if (chunk instanceof ArrayBuffer) {
        validChunks++;
        totalChunkSize += chunk.byteLength;
      }
    });

    // Final verification
    const sizeDifference = meta.size - totalChunkSize;
    if (Math.abs(sizeDifference) > ReceptionConfig.VALIDATION_CONFIG.MAX_SIZE_DIFFERENCE_BYTES) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG] ❌ SIZE_MISMATCH - difference: ${sizeDifference} bytes (threshold: ${ReceptionConfig.VALIDATION_CONFIG.MAX_SIZE_DIFFERENCE_BYTES})`
        );
      }
    }

    // Create file blob from valid chunks
    const validChunkBuffers = chunks.filter(
      (chunk) => chunk instanceof ArrayBuffer
    ) as ArrayBuffer[];

    const fileBlob = new Blob(validChunkBuffers, {
      type: meta.fileType,
    });

    // Create File object
    const file = new File([fileBlob], meta.name, {
      type: meta.fileType,
    });

    // Create CustomFile with additional properties
    const customFile = Object.assign(file, {
      fullName: meta.fullName,
      folderName: currentFolderName,
    }) as CustomFile;

    // Store the file if callback is provided
    let storeUpdated = false;
    if (onFileReceived) {
      await onFileReceived(customFile);
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
      storeUpdated = true;
    }

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      postLogToBackend(
        `[DEBUG] ✅ File assembled - ${meta.name}, chunks: ${validChunks}/${chunks.length}, size: ${totalChunkSize}/${meta.size}, stored: ${storeUpdated}`
      );
    }

    return {
      file: customFile,
      totalChunkSize,
      validChunks,
      storeUpdated,
    };
  }

  /**
   * Validate file assembly completeness
   */
  validateAssembly(
    chunks: (ArrayBuffer | null)[],
    expectedSize: number,
    expectedChunksCount: number
  ): {
    isComplete: boolean;
    validChunks: number;
    totalSize: number;
    missingChunks: number[];
    sizeDifference: number;
  } {
    let totalSize = 0;
    let validChunks = 0;
    const missingChunks: number[] = [];

    chunks.forEach((chunk, index) => {
      if (chunk instanceof ArrayBuffer) {
        validChunks++;
        totalSize += chunk.byteLength;
      } else {
        missingChunks.push(index);
      }
    });

    const sizeDifference = expectedSize - totalSize;
    const isComplete = 
      validChunks === expectedChunksCount && 
      Math.abs(sizeDifference) <= ReceptionConfig.VALIDATION_CONFIG.MAX_SIZE_DIFFERENCE_BYTES;

    return {
      isComplete,
      validChunks,
      totalSize,
      missingChunks,
      sizeDifference,
    };
  }

  /**
   * Get assembly statistics for debugging
   */
  getAssemblyStats(chunks: (ArrayBuffer | null)[]): {
    totalChunks: number;
    validChunks: number;
    nullChunks: number;
    totalSize: number;
    averageChunkSize: number;
    firstNullIndex: number | null;
    lastValidIndex: number | null;
  } {
    let validChunks = 0;
    let totalSize = 0;
    let firstNullIndex: number | null = null;
    let lastValidIndex: number | null = null;

    chunks.forEach((chunk, index) => {
      if (chunk instanceof ArrayBuffer) {
        validChunks++;
        totalSize += chunk.byteLength;
        lastValidIndex = index;
      } else {
        if (firstNullIndex === null) {
          firstNullIndex = index;
        }
      }
    });

    const averageChunkSize = validChunks > 0 ? totalSize / validChunks : 0;

    return {
      totalChunks: chunks.length,
      validChunks,
      nullChunks: chunks.length - validChunks,
      totalSize,
      averageChunkSize,
      firstNullIndex,
      lastValidIndex,
    };
  }

  /**
   * Create file download URL for in-memory files
   */
  createDownloadUrl(file: File): string {
    return URL.createObjectURL(file);
  }

  /**
   * Revoke file download URL to free memory
   */
  revokeDownloadUrl(url: string): void {
    URL.revokeObjectURL(url);
  }

  /**
   * Get file type information
   */
  getFileTypeInfo(file: File): {
    mimeType: string;
    extension: string;
    category: 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';
  } {
    const mimeType = file.type || 'application/octet-stream';
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    let category: 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other' = 'other';

    if (mimeType.startsWith('image/')) {
      category = 'image';
    } else if (mimeType.startsWith('video/')) {
      category = 'video';
    } else if (mimeType.startsWith('audio/')) {
      category = 'audio';
    } else if (
      mimeType.includes('text/') ||
      mimeType.includes('application/pdf') ||
      mimeType.includes('application/msword') ||
      mimeType.includes('application/vnd.openxmlformats')
    ) {
      category = 'document';
    } else if (
      mimeType.includes('zip') ||
      mimeType.includes('rar') ||
      mimeType.includes('tar') ||
      mimeType.includes('gzip')
    ) {
      category = 'archive';
    }

    return {
      mimeType,
      extension,
      category,
    };
  }

  /**
   * Estimate memory usage for file assembly
   */
  estimateMemoryUsage(chunks: (ArrayBuffer | null)[]): {
    chunkMemoryUsage: number;
    estimatedBlobMemory: number;
    totalEstimatedMemory: number;
  } {
    const chunkMemoryUsage = chunks.reduce((sum, chunk) => {
      return sum + (chunk instanceof ArrayBuffer ? chunk.byteLength : 0);
    }, 0);

    // Blob creation might temporarily double memory usage
    const estimatedBlobMemory = chunkMemoryUsage;
    const totalEstimatedMemory = chunkMemoryUsage + estimatedBlobMemory;

    return {
      chunkMemoryUsage,
      estimatedBlobMemory,
      totalEstimatedMemory,
    };
  }

  /**
   * Check if file should be assembled in memory or streamed to disk
   */
  shouldAssembleInMemory(
    fileSize: number,
    hasSaveDirectory: boolean,
    availableMemory?: number
  ): boolean {
    // If we have a save directory and file is large, prefer disk
    if (hasSaveDirectory && fileSize >= ReceptionConfig.FILE_CONFIG.LARGE_FILE_THRESHOLD) {
      return false;
    }

    // If available memory is provided, check if we have enough
    if (availableMemory !== undefined) {
      // Need roughly 2x file size for assembly process
      const requiredMemory = fileSize * 2;
      return availableMemory > requiredMemory;
    }

    // Default: assemble in memory for smaller files
    return fileSize < ReceptionConfig.FILE_CONFIG.LARGE_FILE_THRESHOLD;
  }
}