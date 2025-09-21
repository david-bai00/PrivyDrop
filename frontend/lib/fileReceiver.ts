// 🚀 Modernized FileReceiver using modular architecture
// This file now serves as a compatibility layer for the new modular receive system

import WebRTC_Recipient from "./webrtc_Recipient";
import { CustomFile, fileMetadata } from "@/types/webrtc";
import { createFileReceiveService, FileReceiveOrchestrator } from "./receive";

/**
 * 🚀 FileReceiver - Compatibility wrapper for the new modular architecture
 *
 * This class maintains backward compatibility while using the new modular receive system.
 * All heavy lifting is now done by the FileReceiveOrchestrator and its specialized modules.
 */
class FileReceiver {
  private orchestrator: FileReceiveOrchestrator;

  // Public properties for backward compatibility
  public saveType: Record<string, boolean> = {};

  // Callbacks - these are forwarded to the orchestrator
  public onFileMetaReceived: ((meta: fileMetadata) => void) | undefined =
    undefined;
  public onStringReceived: ((str: string) => void) | undefined = undefined;
  public onFileReceived: ((file: CustomFile) => Promise<void>) | undefined =
    undefined;

  constructor(webrtcRecipient: WebRTC_Recipient) {
    // Create the orchestrator using the factory function
    this.orchestrator = createFileReceiveService(webrtcRecipient);

    // Set up callback forwarding
    this.setupCallbackForwarding();

    this.log("log", "FileReceiver initialized with modular architecture");
  }

  /**
   * Set up callback forwarding to the orchestrator
   */
  private setupCallbackForwarding(): void {
    // Forward file metadata callback
    this.orchestrator.onFileMetaReceived = (meta: fileMetadata) => {
      // Update saveType for backward compatibility
      this.saveType = this.orchestrator.getSaveType();

      if (this.onFileMetaReceived) {
        this.onFileMetaReceived(meta);
      }
    };

    // Forward string received callback
    this.orchestrator.onStringReceived = (str: string) => {
      if (this.onStringReceived) {
        this.onStringReceived(str);
      }
    };

    // Forward file received callback
    this.orchestrator.onFileReceived = async (file: CustomFile) => {
      if (this.onFileReceived) {
        await this.onFileReceived(file);
      }
    };
  }

  /**
   * Set progress callback
   */
  public setProgressCallback(
    callback: (fileId: string, progress: number, speed: number) => void
  ): void {
    this.orchestrator.setProgressCallback(callback);
  }

  /**
   * Set save directory
   */
  public setSaveDirectory(directory: FileSystemDirectoryHandle): Promise<void> {
    return this.orchestrator.setSaveDirectory(directory);
  }

  /**
   * Request a single file from the peer
   */
  public async requestFile(fileId: string, singleFile = true): Promise<void> {
    return this.orchestrator.requestFile(fileId, singleFile);
  }

  /**
   * Request all files belonging to a folder from the peer
   */
  public async requestFolder(folderName: string): Promise<void> {
    return this.orchestrator.requestFolder(folderName);
  }

  /**
   * Graceful shutdown
   */
  public gracefulShutdown(reason: string = "CONNECTION_LOST"): void {
    this.orchestrator.gracefulShutdown(reason);

    // Update saveType for backward compatibility
    this.saveType = {};
  }

  /**
   * Force reset all internal states
   */
  public forceReset(): void {
    this.orchestrator.forceReset();

    // Update saveType for backward compatibility
    this.saveType = {};
  }

  /**
   * Get transfer statistics (for debugging and monitoring)
   */
  public getTransferStats() {
    return this.orchestrator.getTransferStats();
  }

  /**
   * Clean up all resources
   */
  public cleanup(): void {
    this.orchestrator.cleanup();
    this.saveType = {};
  }

  // ===== Private Methods =====

  /**
   * Logging utility
   */
  private log(
    level: "log" | "warn" | "error",
    message: string,
    context?: Record<string, any>
  ) {
    const prefix = `[FileReceiver]`;
    console[level](prefix, message, context || "");
  }

  // ===== Backward Compatibility Getters =====

  /**
   * Get pending files metadata (for backward compatibility)
   */
  public getPendingFilesMeta(): Map<string, fileMetadata> {
    return this.orchestrator.getPendingFilesMeta();
  }

  /**
   * Get folder progresses (for backward compatibility)
   */
  public getFolderProgresses(): Record<string, any> {
    return this.orchestrator.getFolderProgresses();
  }

  /**
   * Check if there's an active file reception
   */
  public hasActiveFileReception(): boolean {
    const stats = this.orchestrator.getTransferStats();
    return stats.stateManager.hasActiveFileReception;
  }

  /**
   * Get current peer ID
   */
  public getCurrentPeerId(): string {
    const stats = this.orchestrator.getTransferStats();
    return stats.stateManager.currentPeerId;
  }
}

export default FileReceiver;
