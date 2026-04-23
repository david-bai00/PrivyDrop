import {
  WebRTCMessage,
  fileMetadata,
  StringMetadata,
  StringChunk,
  FileRequest,
  FileReceiveComplete,
  FolderReceiveComplete,
  FileHandlers,
  SendResult,
  PayloadSnapshot,
} from "@/types/webrtc";
import { ReceptionStateManager } from "./ReceptionStateManager";
import { ReceptionConfig } from "./ReceptionConfig";
import WebRTC_Recipient from "../webrtc_Recipient";
import { createLogger, type RuntimeLogLevel } from "@/lib/logger";

const logger = createLogger({ scope: "Receive.MessageProcessor" });

/**
 * 🚀 Message processor delegate interface
 */
export interface MessageProcessorDelegate {
  onFileMetaReceived?: (meta: fileMetadata) => void;
  onStringReceived?: (str: string) => void;
  onPayloadSnapshotReceived?: (snapshot: PayloadSnapshot) => void;
  log(level: RuntimeLogLevel, event: string, context?: Record<string, any>): void;
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
      payloadSnapshot: this.handlePayloadSnapshot.bind(this),
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
            "message_handler_missing",
            { peerId }
          );
        }
        return null; // String messages don't return binary data
      } catch (error) {
        this.delegate.log("error", "received_json_parse_failed", { error, peerId });
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
        "file_meta_callback_missing",
        { fileId: metadata.fileId }
      );
    }
  }

  /**
   * Handle sender payload snapshot reconciliation messages.
   */
  private handlePayloadSnapshot(snapshot: PayloadSnapshot): void {
    this.stateManager.reconcilePayloadSnapshot(snapshot.fileIds);

    if (this.delegate.onPayloadSnapshotReceived) {
      this.delegate.onPayloadSnapshotReceived(snapshot);
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
      this.delegate.log("warn", "string_chunk_without_active_reception");
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
  async sendFileRequest(
    fileId: string,
    offset: number = 0
  ): Promise<SendResult> {
    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) {
      if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
        logger.error({
          event: "file_request_send_missing_peer",
        });
      }
      return this.buildMissingPeerResult("missing_current_peer");
    }

    const request: FileRequest = { type: "fileRequest", fileId, offset };
    const result = await this.webrtcConnection.sendData(
      JSON.stringify(request),
      peerId
    );
    
    if (result.ok) {
      this.delegate.log("info", "file_request_sent", { request, peerId });
    } else {
      this.delegate.log("error", "file_request_send_failed", {
        request,
        peerId,
        sendResult: result,
      });
    }
    
    return result;
  }

  /**
   * Send file receive complete message
   */
  async sendFileReceiveComplete(
    fileId: string,
    receivedSize: number,
    receivedChunks: number,
    storeUpdated: boolean
  ): Promise<SendResult> {
    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) {
      this.delegate.log("warn", "file_receive_complete_send_missing_peer");
      return this.buildMissingPeerResult("missing_current_peer");
    }

    const completeMessage: FileReceiveComplete = {
      type: "fileReceiveComplete",
      fileId,
      receivedSize,
      receivedChunks,
      storeUpdated,
    };

    const result = await this.webrtcConnection.sendData(
      JSON.stringify(completeMessage),
      peerId
    );

    if (result.ok) {
      this.delegate.log("info", "file_receive_complete_sent", {
        fileId,
        receivedSize,
        receivedChunks,
        storeUpdated,
      });
    } else {
      this.delegate.log("error", "file_receive_complete_send_failed", {
        fileId,
        peerId,
        sendResult: result,
      });
    }

    return result;
  }

  /**
   * Send folder receive complete message
   */
  async sendFolderReceiveComplete(
    folderName: string,
    completedFileIds: string[],
    allStoreUpdated: boolean
  ): Promise<SendResult> {
    const peerId = this.stateManager.getCurrentPeerId();
    if (!peerId) {
      this.delegate.log("warn", "folder_receive_complete_send_missing_peer");
      return this.buildMissingPeerResult("missing_current_peer");
    }

    const completeMessage: FolderReceiveComplete = {
      type: "folderReceiveComplete",
      folderName,
      completedFileIds,
      allStoreUpdated,
    };

    const result = await this.webrtcConnection.sendData(
      JSON.stringify(completeMessage),
      peerId
    );

    if (ReceptionConfig.DEBUG_CONFIG.ENABLE_CHUNK_LOGGING) {
      logger.debug({
        event: "folder_receive_complete_sent",
        context: {
          folderName,
          completedFiles: completedFileIds.length,
          allStoreUpdated,
          success: result.ok,
          peerId,
        },
      });
    }

    if (result.ok) {
      this.delegate.log("info", "folder_receive_complete_sent", {
        folderName,
        completedFiles: completedFileIds.length,
        allStoreUpdated,
      });
    } else {
      this.delegate.log("error", "folder_receive_complete_send_failed", {
        folderName,
        peerId,
        sendResult: result,
      });
    }

    return result;
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

  private buildMissingPeerResult(reason: string): SendResult {
    return {
      ok: false,
      peerId: "",
      attempts: 0,
      finalState: "missing",
      reason,
    };
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
      logger.debug({
        event: "message_processor_cleaned_up",
      });
    }
  }
}
