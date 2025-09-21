import {
  WebRTCMessage,
  fileMetadata,
  StringMetadata,
  StringChunk,
  FileRequest,
  FileReceiveComplete,
  FolderReceiveComplete,
  FileHandlers,
} from "@/types/webrtc";
import { ReceptionStateManager } from "./ReceptionStateManager";
import { ReceptionConfig } from "./ReceptionConfig";
import { postLogToBackend } from "@/app/config/api";
import WebRTC_Recipient from "../webrtc_Recipient";

const developmentEnv = process.env.NODE_ENV;

/**
 * 🚀 Message processor delegate interface
 */
export interface MessageProcessorDelegate {
  onFileMetaReceived?: (meta: fileMetadata) => void;
  onStringReceived?: (str: string) => void;
  log(level: "log" | "warn" | "error", message: string, context?: Record<string, any>): void;
}

/**
 * 🚀 Message processor
 * Handles WebRTC message routing, processing, and communication
 */
export class MessageProcessor {
  private fileHandlers: FileHandlers;

  constructor(
    private stateManager: ReceptionStateManager,
    private webrtcConnection: WebRTC_Recipient,
    private delegate: MessageProcessorDelegate
  ) {
    this.fileHandlers = {
      string: this.handleReceivedStringChunk.bind(this),
      stringMetadata: this.handleStringMetadata.bind(this),
      fileMeta: this.handleFileMetadata.bind(this),
    };
  }

  /**
   * Handle received WebRTC message
   */
  async handleReceivedMessage(
    data: string | ArrayBuffer | any,
    peerId: string
  ): Promise<ArrayBuffer | null> {
    this.stateManager.setCurrentPeerId(peerId);

    if (typeof data === "string") {
      try {
        const parsedData = JSON.parse(data) as WebRTCMessage;
        const handler = this.fileHandlers[parsedData.type as keyof FileHandlers];
        
        if (handler) {
          await handler(parsedData as any, peerId);
        } else {
          this.delegate.log(
            "warn",
            `Handler not found for message type: ${parsedData.type}`,
            { peerId }
          );
        }
        return null; // String messages don't return binary data
      } catch (error) {
        this.delegate.log("error", "Error parsing received JSON data", { error, peerId });
        return null;
      }
    } else {
      // Return binary data for chunk processing
      return data;
    }
  }

  /**
   * Handle file metadata message
   */
  private handleFileMetadata(metadata: fileMetadata): void {
    const isNewMetadata = this.stateManager.addFileMetadata(metadata);
    
    if (!isNewMetadata) {
      return; // Ignore if already received
    }

    if (this.delegate.onFileMetaReceived) {
      this.delegate.onFileMetaReceived(metadata);
    } else {
      this.delegate.log(
        "error",
        "onFileMetaReceived callback not set",
        { fileId: metadata.fileId }
      );
    }
  }

  /**
   * Handle string metadata message
   */
  private handleStringMetadata(metadata: StringMetadata): void {
    this.stateManager.startStringReception(metadata.length);
  }

  /**
   * Handle received string chunk message
   */
  private handleReceivedStringChunk(data: StringChunk): void {
    const activeStringReception = this.stateManager.getActiveStringReception();
    if (!activeStringReception) {
      this.delegate.log("warn", "Received string chunk without active reception");
      return;
    }

    this.stateManager.updateStringReceptionChunk(data.index, data.chunk);

    // Check if string reception is complete
    if (activeStringReception.receivedChunks === data.total) {
      const fullString = this.stateManager.completeStringReception();
      if (fullString && this.delegate.onStringReceived) {
        this.delegate.onStringReceived(fullString);
      }
    }
  }

  /**
   * Send file request message
   */
  sendFileRequest(fileId: string, offset: number = 0): boolean {
    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        postLogToBackend(
          `[DEBUG] ERROR: Cannot send fileRequest - no peerId available!`
        );
      }
      return false;
    }

    const request: FileRequest = { type: "fileRequest", fileId, offset };
    const success = this.webrtcConnection.sendData(JSON.stringify(request), peerId);
    
    if (success) {
      this.delegate.log("log", "Sent fileRequest", { request, peerId });
    } else {
      this.delegate.log("error", "Failed to send fileRequest", { request, peerId });
    }
    
    return success;
  }

  /**
   * Send file receive complete message
   */
  sendFileReceiveComplete(
    fileId: string,
    receivedSize: number,
    receivedChunks: number,
    storeUpdated: boolean
  ): boolean {
    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) {
      this.delegate.log("warn", "Cannot send file receive complete - no peer ID");
      return false;
    }

    const completeMessage: FileReceiveComplete = {
      type: "fileReceiveComplete",
      fileId,
      receivedSize,
      receivedChunks,
      storeUpdated,
    };

    const success = this.webrtcConnection.sendData(
      JSON.stringify(completeMessage),
      peerId
    );

    if (success) {
      this.delegate.log("log", "Sent file receive complete", {
        fileId,
        receivedSize,
        receivedChunks,
        storeUpdated,
      });
    } else {
      this.delegate.log("error", "Failed to send file receive complete", {
        fileId,
        peerId,
      });
    }

    return success;
  }

  /**
   * Send folder receive complete message
   */
  sendFolderReceiveComplete(
    folderName: string,
    completedFileIds: string[],
    allStoreUpdated: boolean
  ): boolean {
    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) {
      this.delegate.log("warn", "Cannot send folder receive complete - no peer ID");
      return false;
    }

    const completeMessage: FolderReceiveComplete = {
      type: "folderReceiveComplete",
      folderName,
      completedFileIds,
      allStoreUpdated,
    };

    const success = this.webrtcConnection.sendData(
      JSON.stringify(completeMessage),
      peerId
    );

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      postLogToBackend(
        `[DEBUG] 📤 Sent folderReceiveComplete - folderName: ${folderName}, completedFiles: ${completedFileIds.length}, allStoreUpdated: ${allStoreUpdated}, success: ${success}`
      );
    }

    if (success) {
      this.delegate.log("log", "Sent folder receive complete", {
        folderName,
        completedFiles: completedFileIds.length,
        allStoreUpdated,
      });
    } else {
      this.delegate.log("error", "Failed to send folder receive complete", {
        folderName,
        peerId,
      });
    }

    return success;
  }

  /**
   * Add Firefox compatibility delay
   */
  async addFirefoxDelay(): Promise<void> {
    await new Promise((resolve) => 
      setTimeout(resolve, ReceptionConfig.NETWORK_CONFIG.FIREFOX_COMPATIBILITY_DELAY)
    );
  }

  /**
   * Get message processing statistics
   */
  getMessageStats(): {
    handledMessages: number;
    lastMessageTime: number | null;
    currentPeerId: string;
  } {
    return {
      handledMessages: 0, // TODO: Implement message counting if needed
      lastMessageTime: null, // TODO: Record last message time if needed
      currentPeerId: this.stateManager.getCurrentPeerId(),
    };
  }

  /**
   * Check if connection is available
   */
  isConnectionAvailable(): boolean {
    const peerId = this.stateManager.getCurrentPeerId();
    return !!peerId && !!this.webrtcConnection;
  }

  /**
   * Get current peer connection info
   */
  getPeerConnectionInfo(): {
    peerId: string;
    isConnected: boolean;
  } {
    const peerId = this.stateManager.getCurrentPeerId();
    return {
      peerId,
      isConnected: this.isConnectionAvailable(),
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      postLogToBackend("[DEBUG] 🧹 MessageProcessor cleaned up");
    }
  }
}