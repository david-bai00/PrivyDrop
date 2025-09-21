import { SpeedCalculator } from "@/lib/speedCalculator";
import { ReceptionStateManager } from "./ReceptionStateManager";
import { ReceptionConfig } from "./ReceptionConfig";
import { postLogToBackend } from "@/app/config/api";

const developmentEnv = process.env.NODE_ENV;

/**
 * 🚀 Progress callback type
 */
export type ProgressCallback = (fileId: string, progress: number, speed: number) => void;

/**
 * 🚀 Progress statistics interface
 */
export interface ProgressStats {
  fileProgress: Record<string, number>;
  folderProgress: Record<string, number>;
  currentSpeed: number;
  averageSpeed: number;
  totalBytesReceived: number;
  estimatedTimeRemaining: number | null;
}

/**
 * 🚀 Progress reporter
 * Handles progress calculation, speed tracking, and progress callback management
 */
export class ProgressReporter {
  private speedCalculator: SpeedCalculator;
  private progressCallback: ProgressCallback | null = null;

  // Progress tracking
  private fileProgressMap = new Map<string, number>();
  private folderProgressMap = new Map<string, number>();
  private lastProgressUpdate = new Map<string, number>();

  constructor(private stateManager: ReceptionStateManager) {
    this.speedCalculator = new SpeedCalculator();
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Update file reception progress
   */
  updateFileProgress(
    byteLength: number,
    fileId: string,
    fileSize: number
  ): void {
    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) return;

    const activeReception = this.stateManager.getActiveFileReception();
    if (!activeReception) return;

    // Update received size
    activeReception.receivedSize += byteLength;
    const totalReceived = activeReception.initialOffset + activeReception.receivedSize;

    const currentFolderName = this.stateManager.getCurrentFolderName();

    if (currentFolderName) {
      // Update folder progress
      this.updateFolderProgress(currentFolderName, byteLength, peerId);
    } else {
      // Update individual file progress
      this.speedCalculator.updateSendSpeed(peerId, totalReceived);
      const speed = this.speedCalculator.getSendSpeed(peerId);
      const progress = fileSize > 0 ? totalReceived / fileSize : 0;

      // Store progress for statistics
      this.fileProgressMap.set(fileId, progress);

      // Throttle progress callbacks to avoid overwhelming the UI
      const now = Date.now();
      const lastUpdate = this.lastProgressUpdate.get(fileId) || 0;
      const shouldUpdate = now - lastUpdate > 100; // Update at most every 100ms

      if (shouldUpdate || progress >= 1) {
        this.progressCallback?.(fileId, progress, speed);
        this.lastProgressUpdate.set(fileId, now);
      }

      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_PROGRESS_LOGGING && progress >= 1) {
        postLogToBackend(
          `[DEBUG] 📈 File progress 100% - ${fileId}, speed: ${(speed / 1024 / 1024).toFixed(1)}MB/s`
        );
      }
    }
  }

  /**
   * Update folder reception progress
   */
  private updateFolderProgress(
    folderName: string,
    byteLength: number,
    peerId: string
  ): void {
    // Update folder received size in state manager
    this.stateManager.updateFolderReceivedSize(folderName, byteLength);
    
    const folderProgress = this.stateManager.getFolderProgress(folderName);
    if (!folderProgress) return;

    this.speedCalculator.updateSendSpeed(peerId, folderProgress.receivedSize);
    const speed = this.speedCalculator.getSendSpeed(peerId);
    const progress = folderProgress.totalSize > 0 
      ? folderProgress.receivedSize / folderProgress.totalSize 
      : 0;

    // Store progress for statistics
    this.folderProgressMap.set(folderName, progress);

    // Throttle folder progress callbacks
    const now = Date.now();
    const lastUpdate = this.lastProgressUpdate.get(folderName) || 0;
    const shouldUpdate = now - lastUpdate > 200; // Update folders less frequently

    if (shouldUpdate || progress >= 1) {
      this.progressCallback?.(folderName, progress, speed);
      this.lastProgressUpdate.set(folderName, now);
    }

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_PROGRESS_LOGGING && progress >= 1) {
      postLogToBackend(
        `[DEBUG] 📈 Folder progress 100% - ${folderName}, speed: ${(speed / 1024 / 1024).toFixed(1)}MB/s`
      );
    }
  }

  /**
   * Report file completion (100% progress)
   */
  reportFileComplete(fileId: string): void {
    if (!this.progressCallback) return;

    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) return;

    // Get final speed and report 100% progress
    const speed = this.speedCalculator.getSendSpeed(peerId);
    this.progressCallback(fileId, 1, speed);
    this.fileProgressMap.set(fileId, 1);

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_PROGRESS_LOGGING) {
      postLogToBackend(
        `[DEBUG] ✅ File completion reported - ${fileId}, final speed: ${(speed / 1024 / 1024).toFixed(1)}MB/s`
      );
    }
  }

  /**
   * Report folder completion (100% progress)
   */
  reportFolderComplete(folderName: string): void {
    if (!this.progressCallback) return;

    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) return;

    // Get final speed and report 100% progress
    const speed = this.speedCalculator.getSendSpeed(peerId);
    this.progressCallback(folderName, 1, speed);
    this.folderProgressMap.set(folderName, 1);

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_PROGRESS_LOGGING) {
      postLogToBackend(
        `[DEBUG] ✅ Folder completion reported - ${folderName}, final speed: ${(speed / 1024 / 1024).toFixed(1)}MB/s`
      );
    }
  }

  /**
   * Get current progress for a file or folder
   */
  getCurrentProgress(id: string): number {
    return this.fileProgressMap.get(id) || this.folderProgressMap.get(id) || 0;
  }

  /**
   * Get current speed for peer
   */
  getCurrentSpeed(): number {
    const peerId = this.stateManager.getCurrentPeerId();
    return peerId ? this.speedCalculator.getSendSpeed(peerId) : 0;
  }

  /**
   * Get detailed progress statistics
   */
  getProgressStats(): ProgressStats {
    const peerId = this.stateManager.getCurrentPeerId();
    const currentSpeed = peerId ? this.speedCalculator.getSendSpeed(peerId) : 0;
    const averageSpeed = currentSpeed; // SpeedCalculator doesn't have getAverageSpeed method

    // Calculate total bytes received
    let totalBytesReceived = 0;
    const activeReception = this.stateManager.getActiveFileReception();
    if (activeReception) {
      totalBytesReceived = activeReception.initialOffset + activeReception.receivedSize;
    }

    // Estimate time remaining
    let estimatedTimeRemaining: number | null = null;
    if (activeReception && currentSpeed > 0) {
      const remainingBytes = activeReception.meta.size - totalBytesReceived;
      if (remainingBytes > 0) {
        estimatedTimeRemaining = remainingBytes / currentSpeed; // seconds
      }
    }

    const fileProgress: Record<string, number> = {};
    this.fileProgressMap.forEach((progress, fileId) => {
      fileProgress[fileId] = progress;
    });

    const folderProgress: Record<string, number> = {};
    this.folderProgressMap.forEach((progress, folderName) => {
      folderProgress[folderName] = progress;
    });

    return {
      fileProgress,
      folderProgress,
      currentSpeed,
      averageSpeed,
      totalBytesReceived,
      estimatedTimeRemaining,
    };
  }

  /**
   * Reset progress for a specific file or folder
   */
  resetProgress(id: string): void {
    this.fileProgressMap.delete(id);
    this.folderProgressMap.delete(id);
    this.lastProgressUpdate.delete(id);
  }

  /**
   * Reset all progress data
   */
  resetAllProgress(): void {
    this.fileProgressMap.clear();
    this.folderProgressMap.clear();
    this.lastProgressUpdate.clear();
    
    // Reset speed calculator for current peer
    // Note: SpeedCalculator doesn't have resetSpeed method, so we create a new instance
    this.speedCalculator = new SpeedCalculator();
  }

  /**
   * Get progress update frequency (for debugging)
   */
  getUpdateFrequency(id: string): number {
    const lastUpdate = this.lastProgressUpdate.get(id);
    return lastUpdate ? Date.now() - lastUpdate : 0;
  }

  /**
   * Check if progress should be throttled
   */
  shouldThrottleProgress(id: string, isFolder: boolean = false): boolean {
    const now = Date.now();
    const lastUpdate = this.lastProgressUpdate.get(id) || 0;
    const threshold = isFolder ? 200 : 100; // Folders update less frequently
    return now - lastUpdate < threshold;
  }

  /**
   * Force progress update (bypass throttling)
   */
  forceProgressUpdate(id: string, progress: number): void {
    if (!this.progressCallback) return;

    const speed = this.getCurrentSpeed();
    this.progressCallback(id, progress, speed);
    this.lastProgressUpdate.set(id, Date.now());

    // Update internal maps
    if (this.fileProgressMap.has(id)) {
      this.fileProgressMap.set(id, progress);
    } else if (this.folderProgressMap.has(id)) {
      this.folderProgressMap.set(id, progress);
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.resetAllProgress();
    this.progressCallback = null;
    
    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_PROGRESS_LOGGING) {
      postLogToBackend("[DEBUG] 🧹 ProgressReporter cleaned up");
    }
  }
}