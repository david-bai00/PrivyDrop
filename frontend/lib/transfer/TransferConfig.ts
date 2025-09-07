/**
 * 🚀 传输配置管理类
 * 集中管理所有文件传输相关的配置参数
 */
export class TransferConfig {
  // 文件I/O相关配置
  static readonly FILE_CONFIG = {
    CHUNK_SIZE: 4194304, // 4MB - 文件读取块大小，减少FileReader调用次数
    BATCH_SIZE: 8, // 8个chunk批处理 - 32MB批处理提升性能
    NETWORK_CHUNK_SIZE: 65536, // 64KB - WebRTC安全发送大小，修复sendData failed
  } as const;

  // 网络传输相关配置
  static readonly NETWORK_CONFIG = {
    BUFFER_THRESHOLD: 3145728, // 3MB - 背压阈值
    BACKPRESSURE_TIMEOUT: 2000, // 2秒超时 - 为大chunk处理预留更多时间
  } as const;

  // 性能调优相关配置
  static readonly PERFORMANCE_CONFIG = {
    MIN_THRESHOLD: 262144, // 256KB - 最小阈值
    MAX_THRESHOLD: 16777216, // 16MB - 最大阈值
    ADJUSTMENT_FACTOR: 0.1, // 调整系数
    ADAPTIVE_SAMPLES: 5, // 自适应采样数
    INITIAL_CLEARING_RATE: 5000, // 5MB/s 初始预估
    INITIAL_WAIT_TIME: 50, // 50ms 初始预估
  } as const;

  // 智能发送控制策略配置
  static readonly SEND_STRATEGY_CONFIG = {
    AGGRESSIVE_THRESHOLD: 0.3, // 积极模式：30%以下
    NORMAL_THRESHOLD: 0.6, // 正常模式：60%以下
    CAUTIOUS_THRESHOLD: 0.9, // 谨慎模式：90%以下
    POLLING_INTERVAL: 5, // 轮询间隔(ms)
    MAX_WAIT_TIME: 3000, // 最大等待时间(ms)
  } as const;

  // 网络质量评估配置
  static readonly QUALITY_CONFIG = {
    GOOD_NETWORK_SPEED: 8000, // 8MB/s 以上为好网络
    AVERAGE_NETWORK_SPEED: 4000, // 4MB/s 以上为平均网络
    GOOD_NETWORK_THRESHOLDS: {
      aggressive: 0.4, // 好网络：40%以下积极发送
      normal: 0.7, // 好网络：70%以下正常发送
      cautious: 0.9, // 好网络：90%以下谨慎发送
    },
    POOR_NETWORK_THRESHOLDS: {
      aggressive: 0.2, // 差网络：20%以下积极发送
      normal: 0.5, // 差网络：50%以下正常发送
      cautious: 0.8, // 差网络：80%以上等待
    },
  } as const;

  /**
   * 获取适应性阈值计算参数
   */
  static getAdaptiveThresholds(networkSpeed: number) {
    if (networkSpeed > this.QUALITY_CONFIG.GOOD_NETWORK_SPEED) {
      // 好网络：使用较高阈值
      return {
        threshold: Math.max(this.NETWORK_CONFIG.BUFFER_THRESHOLD, 6291456), // 6MB
        strategy: this.QUALITY_CONFIG.GOOD_NETWORK_THRESHOLDS,
      };
    } else if (networkSpeed > this.QUALITY_CONFIG.AVERAGE_NETWORK_SPEED) {
      // 平均网络：使用默认阈值
      return {
        threshold: this.NETWORK_CONFIG.BUFFER_THRESHOLD, // 3MB
        strategy: {
          aggressive: this.SEND_STRATEGY_CONFIG.AGGRESSIVE_THRESHOLD,
          normal: this.SEND_STRATEGY_CONFIG.NORMAL_THRESHOLD,
          cautious: this.SEND_STRATEGY_CONFIG.CAUTIOUS_THRESHOLD,
        },
      };
    } else {
      // 差网络：使用较低阈值
      return {
        threshold: Math.min(this.NETWORK_CONFIG.BUFFER_THRESHOLD, 1572864), // 1.5MB
        strategy: this.QUALITY_CONFIG.POOR_NETWORK_THRESHOLDS,
      };
    }
  }

  /**
   * 验证配置的合理性
   */
  static validateConfig(): boolean {
    return (
      this.FILE_CONFIG.NETWORK_CHUNK_SIZE < this.FILE_CONFIG.CHUNK_SIZE &&
      this.NETWORK_CONFIG.BUFFER_THRESHOLD > this.FILE_CONFIG.NETWORK_CHUNK_SIZE &&
      this.PERFORMANCE_CONFIG.MIN_THRESHOLD < this.PERFORMANCE_CONFIG.MAX_THRESHOLD
    );
  }
}
