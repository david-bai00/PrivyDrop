import { SpeedCalculator } from "@/lib/speedCalculator";
import { StateManager } from "./StateManager";
import { postLogToBackend } from "@/app/config/api";

/**
 * 🚀 进度回调类型定义
 */
export type ProgressCallback = (
  fileId: string,
  progress: number,
  speed: number
) => void;

/**
 * 🚀 进度跟踪器
 * 负责文件和文件夹的进度计算、速度统计、回调触发
 */
export class ProgressTracker {
  private speedCalculator = new SpeedCalculator();

  constructor(private stateManager: StateManager) {}

  /**
   * 🎯 更新文件传输进度
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

    // 重要修复：只有成功发送的数据才更新统计
    if (!wasActuallySent) {
      return;
    }

    // 更新文件已发送字节数
    this.stateManager.updateFileBytesSent(peerId, fileId, byteLength);

    // 计算进度ID和统计数据
    let progressFileId = fileId;
    let currentBytes = this.stateManager.getFileBytesSent(peerId, fileId);
    let totalSize = fileSize;

    // 如果文件属于文件夹，重新计算文件夹进度
    if (peerState.currentFolderName) {
      const folderName = peerState.currentFolderName;
      const folderMeta = this.stateManager.getFolderMeta(folderName);

      progressFileId = folderName;
      totalSize = folderMeta?.totalSize || 0;

      // 重新计算文件夹进度（从其所有文件的进度总和）
      // 这对于断点续传更加健壮和正确
      currentBytes = this.stateManager.getFolderBytesSent(peerId, folderName);

      // 删除频繁的文件夹进度日志
    }

    // 更新速度计算器
    this.speedCalculator.updateSendSpeed(peerId, currentBytes);
    const speed = this.speedCalculator.getSendSpeed(peerId);
    const progress = totalSize > 0 ? currentBytes / totalSize : 0;

    // 触发进度回调
    this.triggerProgressCallback(peerId, progressFileId, progress, speed);
  }

  /**
   * 🎯 更新文件夹传输进度
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

    // 计算文件夹总进度
    let totalSentBytes = 0;
    folderMeta.fileIds.forEach((fileId) => {
      totalSentBytes += this.stateManager.getFileBytesSent(peerId, fileId);
    });

    const progress =
      folderMeta.totalSize > 0 ? totalSentBytes / folderMeta.totalSize : 0;
    const speed = this.speedCalculator.getSendSpeed(peerId);

    // 触发文件夹进度回调
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
   * 🎯 设置进度回调函数
   */
  setProgressCallback(callback: ProgressCallback, peerId: string): void {
    this.stateManager.updatePeerState(peerId, { progressCallback: callback });
  }

  /**
   * 🎯 触发进度回调
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
   * 🎯 计算当前传输速度
   */
  getCurrentSpeed(peerId: string): number {
    return this.speedCalculator.getSendSpeed(peerId);
  }

  /**
   * 🎯 完成文件传输进度（设置为100%）
   */
  completeFileProgress(fileId: string, peerId: string): void {
    this.triggerProgressCallback(peerId, fileId, 1.0, 0);

    postLogToBackend(`[DEBUG] ✅ File progress completed: ${fileId}`);
  }

  /**
   * 🎯 完成文件夹传输进度（设置为100%）
   */
  completeFolderProgress(folderName: string, peerId: string): void {
    this.triggerProgressCallback(peerId, folderName, 1.0, 0);

    postLogToBackend(`[DEBUG] ✅ Folder progress completed: ${folderName}`);
  }

  /**
   * 📊 获取详细的进度统计信息
   */
  getProgressStats(peerId: string) {
    const peerState = this.stateManager.getPeerState(peerId);
    const currentSpeed = this.getCurrentSpeed(peerId);

    // 计算总的已发送字节数
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
   * 📊 获取文件夹的详细进度信息
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
      // 注意：这里需要从pendingFiles获取文件大小，暂时使用0
      const total = 0; // TODO: 需要从StateManager获取文件大小
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
   * 🧹 清理进度跟踪资源
   */
  cleanup(): void {
    // SpeedCalculator 内部会自动清理过期数据
    postLogToBackend("[DEBUG] 🧹 ProgressTracker cleaned up");
  }
}
