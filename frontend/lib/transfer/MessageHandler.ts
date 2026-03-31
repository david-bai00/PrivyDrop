import {
  WebRTCMessage,
  FileRequest,
  FileReceiveComplete,
  FolderReceiveComplete
} from "@/types/webrtc";
import { StateManager } from "./StateManager";
import { createLogger } from "@/lib/logger";

const logger = createLogger("MessageHandler");
/**
 * 🚀 Message handling interface - Communicate with main orchestrator
 */
export interface MessageHandlerDelegate {
  handleFileRequest(request: FileRequest, peerId: string): Promise<void>;
  log(
    level: "log" | "warn" | "error",
    message: string,
    context?: Record<string, any>
  ): void;
}

/**
 * 🚀 Message handler
 * Responsible for WebRTC message routing and processing logic
 */
export class MessageHandler {
  constructor(
    private stateManager: StateManager,
    private delegate: MessageHandlerDelegate
  ) {}

  /**
   * 🎯 Handle received signaling message
   */
  handleSignalingMessage(message: WebRTCMessage, peerId: string): void {
    // Delete frequent message reception logs

    switch (message.type) {
      case "fileRequest":
        this.handleFileRequest(message as FileRequest, peerId);
        break;
      case "fileReceiveComplete":
        this.handleFileReceiveComplete(message as FileReceiveComplete, peerId);
        break;
      case "folderReceiveComplete":
        this.handleFolderReceiveComplete(
          message as FolderReceiveComplete,
          peerId
        );
        break;
      default:
        this.delegate.log("warn", `Unknown signaling message type received`, {
          type: message.type,
          peerId,
        });
    }
  }

  /**
   * 📄 Handle file request message
   */
  private async handleFileRequest(
    request: FileRequest,
    peerId: string
  ): Promise<void> {
    const offset = request.offset || 0;

    this.delegate.log(
      "log",
      `Handling file request for ${request.fileId} from ${peerId} with offset ${offset}`
    );

    // Firefox compatibility fix: Add slightly longer delay to ensure receiver is fully ready
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Delegate to main orchestrator for specific file transfer
    try {
      await this.delegate.handleFileRequest(request, peerId);
    } catch (error) {
      this.delegate.log("error", `Error handling file request`, {
        fileId: request.fileId,
        peerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * ✅ Handle file receive completion confirmation message
   */
  private handleFileReceiveComplete(
    message: FileReceiveComplete,
    peerId: string
  ): void {
    // Clean up sending state
    this.stateManager.updatePeerState(peerId, { isSending: false });

    // Get peer state to trigger progress callback
    const peerState = this.stateManager.getPeerState(peerId);

    // Trigger single file 100% progress (only for non-folder cases)
    if (!peerState.currentFolderName) {
      // Delete frequent progress logs
      peerState.progressCallback?.(message.fileId, 1, 0);
    } else {
      // Delete frequent folder progress logs
    }

    this.delegate.log("log", `File reception confirmed by peer ${peerId}`, {
      fileId: message.fileId,
      receivedSize: message.receivedSize,
      storeUpdated: message.storeUpdated,
    });
  }

  /**
   * 📁 Handle folder receive completion confirmation message
   */
  private handleFolderReceiveComplete(
    message: FolderReceiveComplete,
    peerId: string
  ): void {
    logger.debug("Folder receive completion confirmed", {
      folderName: message.folderName,
      completedFiles: message.completedFileIds.length,
      peerId,
    });

    // Get peer state to trigger progress callback
    const peerState = this.stateManager.getPeerState(peerId);

    // Trigger folder 100% progress
    const folderMeta = this.stateManager.getFolderMeta(message.folderName);
    if (folderMeta) {
      logger.debug("Setting folder progress to 100%", {
        folderName: message.folderName,
        peerId,
      });
      peerState.progressCallback?.(message.folderName, 1, 0);
    } else {
      this.delegate.log(
        "warn",
        `Folder metadata not found for completed folder`,
        {
          folderName: message.folderName,
          peerId,
        }
      );
    }

    this.delegate.log("log", `Folder reception confirmed by peer ${peerId}`, {
      folderName: message.folderName,
      completedFiles: message.completedFileIds.length,
      allStoreUpdated: message.allStoreUpdated,
    });
  }

  /**
   * 📊 Get message handling statistics
   */
  public getMessageStats(): {
    handledMessages: number;
    lastMessageTime: number | null;
  } {
    // Message statistics logic can be added here if needed
    return {
      handledMessages: 0, // TODO: Implement message counting
      lastMessageTime: null, // TODO: Record last message time
    };
  }

  /**
   * 🧹 Clean up resources
   */
  public cleanup(): void {
    logger.debug("MessageHandler cleaned up");
  }
}
