import {
  WebRTCMessage,
  FileRequest,
  FileReceiveComplete,
  FolderReceiveComplete,
} from "@/types/webrtc";
import { StateManager } from "./StateManager";
import { postLogToBackend } from "@/app/config/api";

/**
 * 🚀 消息处理接口 - 与主编排器通信
 */
export interface MessageHandlerDelegate {
  handleFileRequest(request: FileRequest, peerId: string): Promise<void>;
  log(level: "log" | "warn" | "error", message: string, context?: Record<string, any>): void;
}

/**
 * 🚀 消息处理器
 * 负责WebRTC消息的路由和处理逻辑
 */
export class MessageHandler {
  constructor(
    private stateManager: StateManager,
    private delegate: MessageHandlerDelegate
  ) {}

  /**
   * 🎯 处理接收到的信令消息
   */
  handleSignalingMessage(message: WebRTCMessage, peerId: string): void {
    postLogToBackend(`[DEBUG] 📨 Message received - type: ${message.type}, peerId: ${peerId}`);
    
    switch (message.type) {
      case "fileRequest":
        this.handleFileRequest(message as FileRequest, peerId);
        break;
      case "fileReceiveComplete":
        this.handleFileReceiveComplete(message as FileReceiveComplete, peerId);
        break;
      case "folderReceiveComplete":
        this.handleFolderReceiveComplete(message as FolderReceiveComplete, peerId);
        break;
      default:
        this.delegate.log("warn", `Unknown signaling message type received`, {
          type: message.type,
          peerId,
        });
    }
  }

  /**
   * 📄 处理文件请求消息
   */
  private async handleFileRequest(request: FileRequest, peerId: string): Promise<void> {
    const offset = request.offset || 0;
    
    this.delegate.log(
      "log",
      `Handling file request for ${request.fileId} from ${peerId} with offset ${offset}`
    );

    // Firefox兼容性修复：添加稍长延迟确保接收端完全准备好
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 委托给主编排器处理具体的文件传输
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
   * ✅ 处理文件接收完成确认消息
   */
  private handleFileReceiveComplete(
    message: FileReceiveComplete,
    peerId: string
  ): void {
    postLogToBackend(
      `[DEBUG] 📥 Received fileReceiveComplete - fileId: ${message.fileId}, receivedSize: ${message.receivedSize}, receivedChunks: ${message.receivedChunks}, storeUpdated: ${message.storeUpdated}`
    );

    // 清理发送状态
    this.stateManager.updatePeerState(peerId, { isSending: false });

    // 获取peer状态以触发进度回调
    const peerState = this.stateManager.getPeerState(peerId);
    
    // 触发单文件100%进度（只有非文件夹情况）
    if (!peerState.currentFolderName) {
      postLogToBackend(
        `[DEBUG] 🎯 Setting single file progress to 100% - ${message.fileId}`
      );
      peerState.progressCallback?.(message.fileId, 1, 0);
    } else {
      postLogToBackend(
        `[DEBUG] 📁 File in folder completed, not setting progress yet - ${message.fileId} (folder: ${peerState.currentFolderName})`
      );
    }

    this.delegate.log("log", `File reception confirmed by peer ${peerId}`, {
      fileId: message.fileId,
      receivedSize: message.receivedSize,
      storeUpdated: message.storeUpdated,
    });
  }

  /**
   * 📁 处理文件夹接收完成确认消息
   */
  private handleFolderReceiveComplete(
    message: FolderReceiveComplete,
    peerId: string
  ): void {
    postLogToBackend(
      `[DEBUG] 📥 Received folderReceiveComplete - folderName: ${message.folderName}, completedFiles: ${message.completedFileIds.length}, allStoreUpdated: ${message.allStoreUpdated}`
    );

    // 获取peer状态以触发进度回调
    const peerState = this.stateManager.getPeerState(peerId);
    
    // 触发文件夹100%进度
    const folderMeta = this.stateManager.getFolderMeta(message.folderName);
    if (folderMeta) {
      postLogToBackend(
        `[DEBUG] 🎯 Setting folder progress to 100% - ${message.folderName}`
      );
      peerState.progressCallback?.(message.folderName, 1, 0);
    } else {
      this.delegate.log("warn", `Folder metadata not found for completed folder`, {
        folderName: message.folderName,
        peerId,
      });
    }

    this.delegate.log("log", `Folder reception confirmed by peer ${peerId}`, {
      folderName: message.folderName,
      completedFiles: message.completedFileIds.length,
      allStoreUpdated: message.allStoreUpdated,
    });
  }

  /**
   * 📊 获取消息处理统计信息
   */
  public getMessageStats(): {
    handledMessages: number;
    lastMessageTime: number | null;
  } {
    // 这里可以添加消息统计逻辑，如果需要的话
    return {
      handledMessages: 0, // TODO: 实现消息计数
      lastMessageTime: null, // TODO: 记录最后消息时间
    };
  }

  /**
   * 🧹 清理资源
   */
  public cleanup(): void {
    postLogToBackend("[DEBUG] 🧹 MessageHandler cleaned up");
  }
}
