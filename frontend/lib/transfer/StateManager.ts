import { PeerState, CustomFile, FolderMeta } from "@/types/webrtc";
import { TransferConfig } from "./TransferConfig";

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

  // ===== 网络性能监控管理 =====

  /**
   * 初始化网络性能监控
   */
  public initializeNetworkPerformance(peerId: string): void {
    if (!this.networkPerformance.has(peerId)) {
      this.networkPerformance.set(peerId, {
        avgClearingRate: TransferConfig.PERFORMANCE_CONFIG.INITIAL_CLEARING_RATE,
        optimalThreshold: TransferConfig.NETWORK_CONFIG.BUFFER_THRESHOLD,
        avgWaitTime: TransferConfig.PERFORMANCE_CONFIG.INITIAL_WAIT_TIME,
        sampleCount: 0,
      });
    }
  }

  /**
   * 更新网络性能指标
   */
  public updateNetworkPerformance(
    peerId: string, 
    clearingRate: number, 
    waitTime: number
  ): void {
    const perf = this.getNetworkPerformance(peerId);
    if (!perf) return;

    perf.sampleCount++;
    // 指数移动平均，对新数据给予更高权重
    const alpha = 0.3;
    perf.avgClearingRate = perf.avgClearingRate * (1 - alpha) + clearingRate * alpha;
    perf.avgWaitTime = perf.avgWaitTime * (1 - alpha) + waitTime * alpha;
    
    // 调整最优阈值
    this.adjustOptimalThreshold(perf);
  }

  /**
   * 从传输速度更新网络性能
   */
  public updateNetworkFromSpeed(peerId: string, currentSpeed: number): void {
    if (currentSpeed <= 0) return;
    
    const perf = this.getNetworkPerformance(peerId);
    if (!perf) return;

    perf.avgClearingRate = currentSpeed;
    perf.sampleCount++;

    // 每10次速度更新调整一次阈值
    if (perf.sampleCount % 10 === 0) {
      this.adjustOptimalThreshold(perf);
    }
  }

  /**
   * 获取网络性能指标
   */
  public getNetworkPerformance(peerId: string): NetworkPerformanceMetrics | undefined {
    return this.networkPerformance.get(peerId);
  }

  /**
   * 获取自适应阈值
   */
  public getAdaptiveThreshold(peerId: string): number {
    const perf = this.networkPerformance.get(peerId);
    return perf ? perf.optimalThreshold : TransferConfig.NETWORK_CONFIG.BUFFER_THRESHOLD;
  }

  /**
   * 调整最优阈值（私有方法）
   */
  private adjustOptimalThreshold(perf: NetworkPerformanceMetrics): void {
    const config = TransferConfig.QUALITY_CONFIG;
    const bufferThreshold = TransferConfig.NETWORK_CONFIG.BUFFER_THRESHOLD;

    if (perf.avgClearingRate > config.GOOD_NETWORK_SPEED) {
      // >8MB/s 好网络
      perf.optimalThreshold = Math.max(bufferThreshold, 6291456); // 6MB
    } else if (perf.avgClearingRate > config.AVERAGE_NETWORK_SPEED) {
      // >4MB/s 平均网络  
      perf.optimalThreshold = bufferThreshold; // 3MB
    } else {
      // 差网络
      perf.optimalThreshold = Math.min(bufferThreshold, 1572864); // 1.5MB
    }
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
