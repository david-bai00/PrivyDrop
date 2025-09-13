import { PeerState, CustomFile, FolderMeta } from "@/types/webrtc";
// Simplified version no longer depends on TransferConfig's complex configuration

/**
 * 🚀 State management class
 * Centrally manages all transfer-related state data
 */
export class StateManager {
  private peerStates = new Map<string, PeerState>();
  private pendingFiles = new Map<string, CustomFile>();
  private pendingFolderMeta: Record<string, FolderMeta> = {};

  // ===== Peer state management =====

  /**
   * Get or create peer state
   */
  public getPeerState(peerId: string): PeerState {
    if (!this.peerStates.has(peerId)) {
      this.peerStates.set(peerId, {
        isSending: false,
        bufferQueue: [],
        readOffset: 0,
        isReading: false,
        currentFolderName: "",
        totalBytesSent: {},
        progressCallback: null,
      });
    }
    return this.peerStates.get(peerId)!;
  }

  /**
   * Update peer state
   */
  public updatePeerState(peerId: string, updates: Partial<PeerState>): void {
    const currentState = this.getPeerState(peerId);
    Object.assign(currentState, updates);
  }

  /**
   * Reset peer state (when transfer is complete or error occurs)
   */
  public resetPeerState(peerId: string): void {
    const peerState = this.getPeerState(peerId);
    peerState.isSending = false;
    peerState.readOffset = 0;
    peerState.bufferQueue = [];
    peerState.isReading = false;
    // Preserve currentFolderName, totalBytesSent, progressCallback
  }

  /**
   * Clear peer state immediately (for graceful disconnect)
   */
  public clearPeerState(peerId: string): void {
    this.peerStates.delete(peerId);
  }

  // ===== File management =====

  /**
   * Add pending file to send
   */
  public addPendingFile(fileId: string, file: CustomFile): void {
    this.pendingFiles.set(fileId, file);
  }

  /**
   * Get pending file to send
   */
  public getPendingFile(fileId: string): CustomFile | undefined {
    return this.pendingFiles.get(fileId);
  }

  /**
   * Remove pending file to send
   */
  public removePendingFile(fileId: string): void {
    this.pendingFiles.delete(fileId);
  }

  /**
   * Get all pending files to send
   */
  public getAllPendingFiles(): Map<string, CustomFile> {
    return new Map(this.pendingFiles);
  }

  // ===== Folder metadata management =====

  /**
   * Add or update folder metadata
   */
  public addFileToFolder(
    folderName: string,
    fileId: string,
    fileSize: number
  ): void {
    if (!this.pendingFolderMeta[folderName]) {
      this.pendingFolderMeta[folderName] = { totalSize: 0, fileIds: [] };
    }

    const folderMeta = this.pendingFolderMeta[folderName];
    if (!folderMeta.fileIds.includes(fileId)) {
      folderMeta.fileIds.push(fileId);
      folderMeta.totalSize += fileSize;
    }
  }

  /**
   * Get folder metadata
   */
  public getFolderMeta(folderName: string): FolderMeta | undefined {
    return this.pendingFolderMeta[folderName];
  }

  /**
   * Get all folder metadata
   */
  public getAllFolderMeta(): Record<string, FolderMeta> {
    return { ...this.pendingFolderMeta };
  }
  // ===== Progress tracking related state =====

  /**
   * Update file sent bytes
   */
  public updateFileBytesSent(
    peerId: string,
    fileId: string,
    bytes: number
  ): void {
    const peerState = this.getPeerState(peerId);
    if (!peerState.totalBytesSent[fileId]) {
      peerState.totalBytesSent[fileId] = 0;
    }
    peerState.totalBytesSent[fileId] += bytes;
  }

  /**
   * Get file sent bytes
   */
  public getFileBytesSent(peerId: string, fileId: string): number {
    const peerState = this.peerStates.get(peerId);
    return peerState?.totalBytesSent[fileId] || 0;
  }

  /**
   * Calculate folder total sent bytes
   */
  public getFolderBytesSent(peerId: string, folderName: string): number {
    const folderMeta = this.getFolderMeta(folderName);
    const peerState = this.peerStates.get(peerId);

    if (!folderMeta || !peerState) return 0;

    let totalSent = 0;
    folderMeta.fileIds.forEach((fileId) => {
      totalSent += peerState.totalBytesSent[fileId] || 0;
    });

    return totalSent;
  }

  // ===== Cleanup and reset =====

  /**
   * Clean up all states (when system resets)
   */
  public cleanup(): void {
    this.peerStates.clear();
    this.pendingFiles.clear();
    this.pendingFolderMeta = {};
  }

  /**
   * Get state statistics (for debugging)
   */
  public getStateStats() {
    return {
      peerCount: this.peerStates.size,
      pendingFileCount: this.pendingFiles.size,
      folderCount: Object.keys(this.pendingFolderMeta).length,
    };
  }
}
