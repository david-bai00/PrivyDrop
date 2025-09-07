import { PeerState, CustomFile, FolderMeta } from "@/types/webrtc";
// 简化版不再依赖TransferConfig的复杂配置

/**
 * 🚀 网络性能监控指标接口
 */
export interface NetworkPerformanceMetrics {
  avgClearingRate: number; // 平均网络清理速度 KB/s
  optimalThreshold: number; // 动态优化的阈值
  avgWaitTime: number; // 平均等待时间
  sampleCount: number; // 样本计数
}

/**
 * 🚀 状态管理类
 * 集中管理所有传输相关的状态数据
 */
export class StateManager {
  private peerStates = new Map<string, PeerState>();
  private pendingFiles = new Map<string, CustomFile>();
  private pendingFolderMeta: Record<string, FolderMeta> = {};
  private networkPerformance = new Map<string, NetworkPerformanceMetrics>();

  // ===== Peer状态管理 =====

  /**
   * 获取或创建peer状态
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
   * 更新peer状态
   */
  public updatePeerState(peerId: string, updates: Partial<PeerState>): void {
    const currentState = this.getPeerState(peerId);
    Object.assign(currentState, updates);
  }

  /**
   * 重置peer状态（传输完成或出错时）
   */
  public resetPeerState(peerId: string): void {
    const peerState = this.getPeerState(peerId);
    peerState.isSending = false;
    peerState.readOffset = 0;
    peerState.bufferQueue = [];
    peerState.isReading = false;
    // 保留 currentFolderName, totalBytesSent, progressCallback
  }

  /**
   * 删除peer状态（peer断开连接时）
   */
  public removePeerState(peerId: string): void {
    this.peerStates.delete(peerId);
    this.networkPerformance.delete(peerId);
  }

  // ===== 文件管理 =====

  /**
   * 添加待发送文件
   */
  public addPendingFile(fileId: string, file: CustomFile): void {
    this.pendingFiles.set(fileId, file);
  }

  /**
   * 获取待发送文件
   */
  public getPendingFile(fileId: string): CustomFile | undefined {
    return this.pendingFiles.get(fileId);
  }

  /**
   * 删除待发送文件
   */
  public removePendingFile(fileId: string): void {
    this.pendingFiles.delete(fileId);
  }

  /**
   * 获取所有待发送文件
   */
  public getAllPendingFiles(): Map<string, CustomFile> {
    return new Map(this.pendingFiles);
  }

  // ===== 文件夹元数据管理 =====

  /**
   * 添加或更新文件夹元数据
   */
  public addFileToFolder(folderName: string, fileId: string, fileSize: number): void {
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
   * 获取文件夹元数据
   */
  public getFolderMeta(folderName: string): FolderMeta | undefined {
    return this.pendingFolderMeta[folderName];
  }

  /**
   * 获取所有文件夹元数据
   */
  public getAllFolderMeta(): Record<string, FolderMeta> {
    return { ...this.pendingFolderMeta };
  }
  // ===== 进度跟踪相关状态 =====

  /**
   * 更新文件发送字节数
   */
  public updateFileBytesSent(peerId: string, fileId: string, bytes: number): void {
    const peerState = this.getPeerState(peerId);
    if (!peerState.totalBytesSent[fileId]) {
      peerState.totalBytesSent[fileId] = 0;
    }
    peerState.totalBytesSent[fileId] += bytes;
  }

  /**
   * 获取文件已发送字节数
   */
  public getFileBytesSent(peerId: string, fileId: string): number {
    const peerState = this.peerStates.get(peerId);
    return peerState?.totalBytesSent[fileId] || 0;
  }

  /**
   * 计算文件夹总发送字节数
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

  // ===== 清理和重置 =====

  /**
   * 清理所有状态（系统重置时）
   */
  public cleanup(): void {
    this.peerStates.clear();
    this.pendingFiles.clear();
    this.pendingFolderMeta = {};
    this.networkPerformance.clear();
  }

  /**
   * 获取状态统计信息（调试用）
   */
  public getStateStats() {
    return {
      peerCount: this.peerStates.size,
      pendingFileCount: this.pendingFiles.size,
      folderCount: Object.keys(this.pendingFolderMeta).length,
      networkPerfCount: this.networkPerformance.size,
    };
  }
}
