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
}
