/**
 * 🚀 Transfer configuration management class
 * Centrally manages all file transfer related configuration parameters
 */
export class TransferConfig {
  // File I/O related configuration
  static readonly FILE_CONFIG = {
    CHUNK_SIZE: 4194304, // 4MB - File reading chunk size, reduces FileReader calls
    BATCH_SIZE: 8, // 8 chunks batch processing - 32MB batch processing improves performance
    NETWORK_CHUNK_SIZE: 65536, // 64KB - WebRTC safe sending size, fixes sendData failed
  } as const;
}
