import {
  fileMetadata,
  FolderProgress,
  CurrentString,
  CustomFile,
} from "@/types/webrtc";

/**
 * 🚀 Active file reception state interface
 */
export interface ActiveFileReception {
  meta: fileMetadata;
  chunks: (ArrayBuffer | null)[];
  receivedSize: number;
  initialOffset: number;
  fileHandle: FileSystemFileHandle | null;
  writeStream: FileSystemWritableFileStream | null;
  sequencedWriter: any | null; // Will be typed properly when StreamingFileWriter is implemented
  completionNotifier: {
    resolve: () => void;
    reject: (reason?: any) => void;
  };
  receivedChunksCount: number;
  expectedChunksCount: number;
  chunkSequenceMap: Map<number, boolean>;
  isFinalized?: boolean;
}

/**
 * 🚀 Reception state management
 * Centrally manages all file reception state data
 */
export class ReceptionStateManager {
  // File metadata management
  private pendingFilesMeta = new Map<string, fileMetadata>();
  
  // Folder progress tracking
  private folderProgresses: Record<string, FolderProgress> = {};
  
  // Save type configuration (fileId/folderName -> isSavedToDisk)
  public saveType: Record<string, boolean> = {};
  
  // Active transfer states
  private activeFileReception: ActiveFileReception | null = null;
  private activeStringReception: CurrentString | null = null;
  private currentFolderName: string | null = null;
  
  // Peer information
  private currentPeerId: string = "";
  private saveDirectory: FileSystemDirectoryHandle | null = null;

  // ===== File Metadata Management =====

  /**
   * Add file metadata
   */
  public addFileMetadata(metadata: fileMetadata): boolean {
    if (this.pendingFilesMeta.has(metadata.fileId)) {
      return false; // Already exists
    }
    
    this.pendingFilesMeta.set(metadata.fileId, metadata);
    
    // Update folder progress if this file belongs to a folder
    if (metadata.folderName) {
      this.addFileToFolder(metadata.folderName, metadata.fileId, metadata.size);
    }
    
    return true; // New metadata added
  }

  /**
   * Get file metadata by ID
   */
  public getFileMetadata(fileId: string): fileMetadata | undefined {
    return this.pendingFilesMeta.get(fileId);
  }

  /**
   * Get all pending file metadata
   */
  public getAllFileMetadata(): Map<string, fileMetadata> {
    return new Map(this.pendingFilesMeta);
  }

  /**
   * Remove file metadata
   */
  public removeFileMetadata(fileId: string): void {
    this.pendingFilesMeta.delete(fileId);
  }

  // ===== Folder Progress Management =====

  /**
   * Add file to folder progress tracking
   */
  private addFileToFolder(folderName: string, fileId: string, fileSize: number): void {
    if (!this.folderProgresses[folderName]) {
      this.folderProgresses[folderName] = {
        totalSize: 0,
        receivedSize: 0,
        fileIds: [],
      };
    }

    const folderProgress = this.folderProgresses[folderName];
    if (!folderProgress.fileIds.includes(fileId)) {
      folderProgress.fileIds.push(fileId);
      folderProgress.totalSize += fileSize;
    }
  }

  /**
   * Get folder progress
   */
  public getFolderProgress(folderName: string): FolderProgress | undefined {
    return this.folderProgresses[folderName];
  }

  /**
   * Update folder received size
   */
  public updateFolderReceivedSize(folderName: string, additionalBytes: number): void {
    const folderProgress = this.folderProgresses[folderName];
    if (folderProgress) {
      folderProgress.receivedSize += additionalBytes;
    }
  }

  /**
   * Set folder received size (for resume scenarios)
   */
  public setFolderReceivedSize(folderName: string, totalReceivedSize: number): void {
    const folderProgress = this.folderProgresses[folderName];
    if (folderProgress) {
      folderProgress.receivedSize = totalReceivedSize;
    }
  }

  /**
   * Get all folder progresses
   */
  public getAllFolderProgresses(): Record<string, FolderProgress> {
    return { ...this.folderProgresses };
  }

  // ===== Active File Reception Management =====

  /**
   * Start active file reception
   */
  public startFileReception(
    meta: fileMetadata,
    expectedChunksCount: number,
    initialOffset: number = 0
  ): Promise<void> {
    if (this.activeFileReception) {
      throw new Error("Another file reception is already in progress");
    }

    return new Promise<void>((resolve, reject) => {
      this.activeFileReception = {
        meta,
        chunks: new Array(expectedChunksCount).fill(null),
        receivedSize: 0,
        initialOffset,
        fileHandle: null,
        writeStream: null,
        sequencedWriter: null,
        completionNotifier: { resolve, reject },
        receivedChunksCount: 0,
        expectedChunksCount,
        chunkSequenceMap: new Map<number, boolean>(),
        isFinalized: false,
      };
    });
  }

  /**
   * Get active file reception
   */
  public getActiveFileReception(): ActiveFileReception | null {
    return this.activeFileReception;
  }

  /**
   * Update active file reception
   */
  public updateActiveFileReception(updates: Partial<ActiveFileReception>): void {
    if (this.activeFileReception) {
      Object.assign(this.activeFileReception, updates);
    }
  }

  /**
   * Complete active file reception
   */
  public completeFileReception(): void {
    if (this.activeFileReception?.completionNotifier) {
      this.activeFileReception.completionNotifier.resolve();
    }
    this.activeFileReception = null;
  }

  /**
   * Fail active file reception
   */
  public failFileReception(reason: any): void {
    if (this.activeFileReception?.completionNotifier) {
      this.activeFileReception.completionNotifier.reject(reason);
    }
    this.activeFileReception = null;
  }

  // ===== String Reception Management =====

  /**
   * Start string reception
   */
  public startStringReception(length: number): void {
    this.activeStringReception = {
      length,
      chunks: [],
      receivedChunks: 0,
    };
  }

  /**
   * Get active string reception
   */
  public getActiveStringReception(): CurrentString | null {
    return this.activeStringReception;
  }

  /**
   * Update string reception chunk
   */
  public updateStringReceptionChunk(index: number, chunk: string): void {
    if (this.activeStringReception) {
      this.activeStringReception.chunks[index] = chunk;
      this.activeStringReception.receivedChunks++;
    }
  }

  /**
   * Complete string reception
   */
  public completeStringReception(): string | null {
    if (!this.activeStringReception) return null;
    
    const fullString = this.activeStringReception.chunks.join("");
    this.activeStringReception = null;
    return fullString;
  }

  // ===== Current Context Management =====

  /**
   * Set current folder name
   */
  public setCurrentFolderName(folderName: string | null): void {
    this.currentFolderName = folderName;
  }

  /**
   * Get current folder name
   */
  public getCurrentFolderName(): string | null {
    return this.currentFolderName;
  }

  /**
   * Set current peer ID
   */
  public setCurrentPeerId(peerId: string): void {
    this.currentPeerId = peerId;
  }

  /**
   * Get current peer ID
   */
  public getCurrentPeerId(): string {
    return this.currentPeerId;
  }

  /**
   * Set save directory
   */
  public setSaveDirectory(directory: FileSystemDirectoryHandle | null): void {
    this.saveDirectory = directory;
  }

  /**
   * Get save directory
   */
  public getSaveDirectory(): FileSystemDirectoryHandle | null {
    return this.saveDirectory;
  }

  // ===== Save Type Management =====

  /**
   * Set save type for file or folder
   */
  public setSaveType(id: string, saveToDisk: boolean): void {
    this.saveType[id] = saveToDisk;
  }

  /**
   * Get save type for file or folder
   */
  public getSaveType(id: string): boolean {
    return this.saveType[id] || false;
  }

  // ===== State Reset and Cleanup =====

  /**
   * Force reset all states (for reconnection scenarios)
   */
  public forceReset(): void {
    this.pendingFilesMeta.clear();
    this.folderProgresses = {};
    this.saveType = {};
    this.activeFileReception = null;
    this.activeStringReception = null;
    this.currentFolderName = null;
    this.currentPeerId = "";
    // Note: saveDirectory is preserved
  }

  /**
   * Graceful cleanup (preserve some state for potential resume)
   */
  public gracefulCleanup(): void {
    this.activeFileReception = null;
    this.activeStringReception = null;
    this.currentFolderName = null;
    // Note: preserve pendingFilesMeta, folderProgresses, saveType for potential resume
  }

  /**
   * Get state statistics (for debugging)
   */
  public getStateStats() {
    return {
      pendingFilesCount: this.pendingFilesMeta.size,
      folderCount: Object.keys(this.folderProgresses).length,
      hasActiveFileReception: !!this.activeFileReception,
      hasActiveStringReception: !!this.activeStringReception,
      currentFolderName: this.currentFolderName,
      currentPeerId: this.currentPeerId,
      hasSaveDirectory: !!this.saveDirectory,
      saveTypeCount: Object.keys(this.saveType).length,
    };
  }
}