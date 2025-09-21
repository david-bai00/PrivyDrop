import { SpeedCalculator } from "@/lib/speedCalculator";
import { StateManager } from "./StateManager";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NODE_ENV;
/**
 * 🚀 Progress callback type definition
 */
export type ProgressCallback = (
  fileId: string,
  progress: number,
  speed: number
) => void;

/**
 * 🚀 Progress tracker
 * Responsible for file and folder progress calculation, speed statistics, and callback triggering
 */
export class ProgressTracker {
  private speedCalculator = new SpeedCalculator();

  constructor(private stateManager: StateManager) {}

  /**
   * 🎯 Update file transfer progress
   */
  async updateFileProgress(
    byteLength: number,
    fileId: string,
    fileSize: number,
    peerId: string,
    wasActuallySent: boolean = true
  ): Promise<void> {
    const peerState = this.stateManager.getPeerState(peerId);
    if (!peerState) return;

    // Important fix: Only update statistics for successfully sent data
    if (!wasActuallySent) {
      return;
    }

    // Update file sent bytes
    this.stateManager.updateFileBytesSent(peerId, fileId, byteLength);

    // Calculate progress ID and statistics
    let progressFileId = fileId;
    let currentBytes = this.stateManager.getFileBytesSent(peerId, fileId);
    let totalSize = fileSize;

    // If file belongs to a folder, recalculate folder progress
    if (peerState.currentFolderName) {
      const folderName = peerState.currentFolderName;
      const folderMeta = this.stateManager.getFolderMeta(folderName);

      progressFileId = folderName;
      totalSize = folderMeta?.totalSize || 0;

      // Recalculate folder progress (sum of progress from all its files)
      // This is more robust and correct for resume downloads
      currentBytes = this.stateManager.getFolderBytesSent(peerId, folderName);

      // Delete frequent folder progress logs
    }

    // Update speed calculator
    this.speedCalculator.updateSendSpeed(peerId, currentBytes);
    const speed = this.speedCalculator.getSendSpeed(peerId);
    const progress = totalSize > 0 ? currentBytes / totalSize : 0;

    // Trigger progress callback
    this.triggerProgressCallback(peerId, progressFileId, progress, speed);
  }

  /**
   * 🎯 Update folder transfer progress
   */
  async updateFolderProgress(
    folderName: string,
    fileProgress: Record<string, number>,
    peerId: string
  ): Promise<void> {
    const folderMeta = this.stateManager.getFolderMeta(folderName);
    if (!folderMeta) {
      postLogToBackend(`[DEBUG] ⚠️ Folder metadata not found: ${folderName}`);
      return;
    }

    // Calculate total folder progress
    let totalSentBytes = 0;
    folderMeta.fileIds.forEach((fileId) => {
      totalSentBytes += this.stateManager.getFileBytesSent(peerId, fileId);
    });

    const progress =
      folderMeta.totalSize > 0 ? totalSentBytes / folderMeta.totalSize : 0;
    const speed = this.speedCalculator.getSendSpeed(peerId);

    // Trigger folder progress callback
    this.triggerProgressCallback(peerId, folderName, progress, speed);

    postLogToBackend(
      `[DEBUG] 📁 Folder progress - ${folderName}: ${(progress * 100).toFixed(
        2
      )}%, speed: ${speed.toFixed(2)} KB/s, bytes: ${totalSentBytes}/${
        folderMeta.totalSize
      }`
    );
  }

  /**
   * 🎯 Set progress callback function
   */
  setProgressCallback(callback: ProgressCallback, peerId: string): void {
    this.stateManager.updatePeerState(peerId, { progressCallback: callback });
  }

  /**
   * 🎯 Trigger progress callback
   */
  private triggerProgressCallback(
    peerId: string,
    fileId: string,
    progress: number,
    speed: number
  ): void {
    const peerState = this.stateManager.getPeerState(peerId);
    if (peerState.progressCallback) {
      try {
        peerState.progressCallback(fileId, progress, speed);
      } catch (error) {
        postLogToBackend(
          `[DEBUG] ❌ Progress callback error - fileId: ${fileId}, error: ${error}`
        );
      }
    }
  }

  /**
   * 🎯 Calculate current transfer speed
   */
  getCurrentSpeed(peerId: string): number {
    return this.speedCalculator.getSendSpeed(peerId);
  }

  /**
   * 🎯 Complete file transfer progress (set to 100%)
   */
  completeFileProgress(fileId: string, peerId: string): void {
    this.triggerProgressCallback(peerId, fileId, 1.0, 0);

    postLogToBackend(`[DEBUG] ✅ File progress completed: ${fileId}`);
  }

  /**
   * 🎯 Complete folder transfer progress (set to 100%)
   */
  completeFolderProgress(folderName: string, peerId: string): void {
    this.triggerProgressCallback(peerId, folderName, 1.0, 0);

    postLogToBackend(`[DEBUG] ✅ Folder progress completed: ${folderName}`);
  }

  /**
   * 📊 Get detailed progress statistics
   */
  getProgressStats(peerId: string) {
    const peerState = this.stateManager.getPeerState(peerId);
    const currentSpeed = this.getCurrentSpeed(peerId);

    // Calculate total sent bytes
    let totalBytesSent = 0;
    Object.values(peerState.totalBytesSent).forEach((bytes) => {
      totalBytesSent += bytes;
    });

    return {
      peerId,
      currentSpeed,
      totalBytesSent,
      activeTransfers: Object.keys(peerState.totalBytesSent).length,
      currentFolderName: peerState.currentFolderName,
      isSending: peerState.isSending,
      hasProgressCallback: !!peerState.progressCallback,
    };
  }

  /**
   * 📊 Get detailed folder progress information
   */
  getFolderProgressDetails(folderName: string, peerId: string) {
    const folderMeta = this.stateManager.getFolderMeta(folderName);
    if (!folderMeta) return null;

    const fileProgresses: Record<
      string,
      { sent: number; total: number; progress: number }
    > = {};
    let totalSent = 0;

    folderMeta.fileIds.forEach((fileId) => {
      const sent = this.stateManager.getFileBytesSent(peerId, fileId);
      // Note: Need to get file size from pendingFiles, temporarily using 0
      const total = 0; // TODO: Need to get file size from StateManager
      totalSent += sent;

      fileProgresses[fileId] = {
        sent,
        total,
        progress: total > 0 ? sent / total : 0,
      };
    });

    return {
      folderName,
      totalSize: folderMeta.totalSize,
      totalSent,
      overallProgress:
        folderMeta.totalSize > 0 ? totalSent / folderMeta.totalSize : 0,
      fileCount: folderMeta.fileIds.length,
      fileProgresses,
    };
  }

  /**
   * 🧹 Clean up progress tracking resources
   */
  cleanup(): void {
    // SpeedCalculator internally automatically cleans up expired data
    if (developmentEnv === "development")
      postLogToBackend("[DEBUG] 🧹 ProgressTracker cleaned up");
  }
}
