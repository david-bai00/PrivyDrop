import {CustomFile } from '@/lib/types/file';

//对文件大小自适应单位并格式化输出
export const formatFileSize = (sizeInBytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = sizeInBytes;
    let unitIndex = 0;
  
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
  
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

//用来计算传输速度,支持多个 peerId
export class SpeedCalculator {
  private speeds: Map<string, number>;//peerId,speed
  private windowSize: number = 2; // 5秒的滑动窗口
  private transferHistory: Map<string, Array<{time: number, totalBytes: number}>>;//peerId={time,totalBytes}
  private maxSpeed: number = 1024 * 1024; // 最大速度限制（KB/s）
  private lastUpdateTimes: Map<string, number>; // 记录每个peerId最后更新时间
  private updateInterval: number = 100; // 最小更新间隔（ms）

  constructor() {
    this.speeds = new Map();
    this.transferHistory = new Map();
    this.lastUpdateTimes = new Map();
  }

  updateSendSpeed(peerId: string, totalBytesSent: number) {
    const now = Date.now();
    
    // 检查是否达到更新间隔
    const lastUpdate = this.lastUpdateTimes.get(peerId) || 0;
    if (now - lastUpdate < this.updateInterval) {
      return; // 如果间隔太短，直接返回
    }
    
    // 初始化或获取传输历史
    if (!this.transferHistory.has(peerId)) {
      this.transferHistory.set(peerId, []);
    }
    const history = this.transferHistory.get(peerId)!;
    
    // 添加新的累计传输记录
    history.push({ time: now, totalBytes: totalBytesSent });
    
    // 移除窗口外的旧数据
    const windowStart = now - this.windowSize * 1000;
    
    while (history.length > 0 && history[0].time < windowStart) {
      history.shift();
    }
    
    // 计算窗口内的总传输量和时间差
    if (history.length > 1) {
      // 使用窗口内第一个和最后一个点来计算速度
      const firstRecord = history[0];
      const lastRecord = history[history.length - 1];
      
      const bytesDiff = lastRecord.totalBytes - firstRecord.totalBytes;
      const timeSpan = (lastRecord.time - firstRecord.time) / 1000; // 转换为秒
      
      // 计算速度（KB/s）并应用限制
      let speed = timeSpan > 0 ? bytesDiff / 1024 / timeSpan : 0;
      speed = Math.min(speed, this.maxSpeed);
      
      // 减小平滑因子，使速度更快反应变化
      const oldSpeed = this.speeds.get(peerId) || 0;
      const smoothingFactor = 0.3; // 减小平滑因子
      const smoothedSpeed = oldSpeed * (1 - smoothingFactor) + speed * smoothingFactor;
      
      this.speeds.set(peerId, smoothedSpeed);
    }

    // 更新最后更新时间
    this.lastUpdateTimes.set(peerId, now);
  }

  getSendSpeed(peerId: string): number {
    return this.speeds.get(peerId) || 0;
  }
}
export const generateFileId = (file:CustomFile):string => {
  return `${file.fullName}-${file.size}-${file.type}-${file.lastModified}`;
}