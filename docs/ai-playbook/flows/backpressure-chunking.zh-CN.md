# PrivyDrop AI Playbook — 背压与分片策略深度分析（中文）

← 返回流程入口：[`docs/ai-playbook/flows.zh-CN.md`](../flows.zh-CN.md)

（本页从 `docs/ai-playbook/flows.zh-CN.md` 拆分，保留原章节编号与内容。）

## 7）背压与分片策略深度分析

### 发送侧双层缓冲架构

**设计原理**：

- **文件读取层**：4MB 分片减少 FileReader 调用，8 个分片组成 32MB 批次
- **网络传输层**：64KB 小块适配 WebRTC DataChannel 限制，避免 sendData failed 错误
- **性能优化**：批次内高效切片，一次 FileReader.read()产生 512 个网络块

**配置参数**：

```typescript
TransferConfig.FILE_CONFIG = {
  CHUNK_SIZE: 4194304, // 4MB - 文件读取分片
  BATCH_SIZE: 8, // 8个分片 = 32MB批次
  NETWORK_CHUNK_SIZE: 65536, // 64KB - WebRTC安全发送大小
};
```

**背压控制机制**：

- **DataChannel 阈值**：`bufferedAmountLowThreshold = 256KB`（Initiator）和`512KB`（NetworkTransmitter）
- **最大缓冲限制**：`maxBuffer = 1MB`，超过时等待背压释放
- **异步等待策略**：监听`bufferedamountlow`事件，支持超时机制（10 秒）

**嵌入元数据包格式**：

```
[4字节长度][JSON元数据][实际数据块]
```

- 每个网络块都包含：chunkIndex、totalChunks、fileOffset、fileId、isLastChunk
- 接收端可独立解析，无需依赖额外状态

### 接收侧智能存储策略

**存储选择逻辑**：

```typescript
ReceptionConfig.shouldSaveToDisk(fileSize, hasSaveDirectory);
```

- **内存存储**：文件 < 1GB 且未指定保存目录
- **磁盘存储**：文件 ≥ 1GB 或用户选择了保存目录
- **缓冲管理**：最多缓存 100 个分片（约 6.4MB）

**分片验证机制**：

- **格式兼容**：支持 ArrayBuffer/Blob/Uint8Array/TypedArray 多种格式
- **完整性检查**：验证 fileId、chunkIndex、chunkSize 一致性
- **Firefox 兼容**：Blob size 检测和转换错误处理

**严格顺序写入**：

- **SequencedDiskWriter**：确保分片按序写入磁盘，支持大文件流式处理
- **断点续传**：通过`getPartialFileSize()`检查本地部分文件
- **自动完成检测**：`checkAndAutoFinalize()`验证分片完整性

### 性能优化细节

**发送侧优化**：

- **批量读取**：32MB 批次减少 I/O 操作，提升大文件读取性能
- **网络适配**：64KB 块平衡传输效率与浏览器兼容性
- **背压响应**：利用 WebRTC 原生背压控制，避免数据丢失

**接收侧优化**：

- **格式转换**：ChunkProcessor 统一处理多种数据格式
- **进度节流**：文件 100ms、文件夹 200ms 间隔更新，避免 UI 过载
- **内存管理**：小文件内存组装，大文件直接写入磁盘

**错误处理**：

- **发送重试**：NetworkTransmitter 返回 boolean 状态，支持上层重试逻辑
- **转换容错**：Blob conversion failed 时返回 null，不中断整体传输
- **超时保护**：文件完成 30 秒超时，优雅关闭 5 秒超时

### 调试与监控

**开发环境日志**：

- **分片跟踪**：每 100 个分片或最后分片记录详细信息
- **背压监控**：缓冲区大小变化和等待时间统计
- **性能指标**：传输速度、批次处理时间、格式转换耗时

**生产环境优化**：

- **条件日志**：`ENABLE_CHUNK_LOGGING`和`ENABLE_PROGRESS_LOGGING`开关
- **错误上报**：关键错误通过`postLogToBackend`发送到后端
- **性能采样**：通过`performance.now()`精确测量耗时
