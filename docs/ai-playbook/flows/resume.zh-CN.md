# PrivyDrop AI Playbook — 断点续传深度分析（中文）

← 返回流程入口：[`docs/ai-playbook/flows.zh-CN.md`](../flows.zh-CN.md)

（本页从 `docs/ai-playbook/flows.zh-CN.md` 拆分，保留原章节编号与内容。）

## 9）断点续传深度分析

### 断点续传核心机制

**续传检测与状态恢复**：

- **发送侧初始化**：`StreamingFileReader constructor(file, startOffset)` 支持从任意偏移量开始
- **接收侧检测**：`StreamingFileWriter.getPartialFileSize()` 通过 File System Access API 检查部分文件
- **状态同步**：fileRequest 消息包含 offset 参数，通知发送方从指定位置继续传输

**分片索引计算**：

```typescript
// 统一的分片计算逻辑
const startChunk = Math.floor(startOffset / chunkSize);
const expectedChunks = Math.ceil((fileSize - startOffset) / chunkSize);
```

### ChunkRangeCalculator 统一计算器

**设计目的**：确保发送端和接收端使用完全相同的分片计算逻辑

```typescript
getChunkRange(fileSize, startOffset, chunkSize) {
  const startChunk = Math.floor(startOffset / chunkSize);
  const endChunk = Math.floor((fileSize - 1) / chunkSize);
  return { startChunk, endChunk, totalChunks: endChunk - startChunk + 1 };
}
```

**关键方法**：

- `getRelativeChunkIndex()`：绝对索引转相对索引，用于接收端数组映射
- `isChunkIndexValid()`：验证分片索引是否在预期范围内
- `calculateExpectedChunks()`：计算预期分片数量，与 ReceptionConfig 保持一致

### 接收侧续传流程

**部分文件检测**：

1. **目录准备**：`createFolderStructure()` 确保目标目录存在
2. **文件查询**：通过 `getFileHandle(fileName, {create: false})` 检查文件是否存在
3. **大小获取**：`file.getFile()` 获取当前文件大小作为续传起点

**续传决策逻辑**：

```typescript
// FileReceiveOrchestrator.ts
const offset = await this.streamingFileWriter.getPartialFileSize(
  fileInfo.name,
  fileInfo.fullName
);
if (offset === fileInfo.size) {
  // 文件已完整，跳过传输
  return;
}
if (offset > 0) {
  // 发现部分文件，准备续传
  // 发送包含 offset 的 fileRequest
}
```

### 发送侧续传响应

**续传准备**：

- **重置读取器**：`StreamingFileReader.reset(startOffset)` 从新的偏移量开始
- **批次调整**：`currentBatchStartOffset` 和 `totalFileOffset` 同步更新
- **分片索引**：`startChunkIndex` 记录传输起始点，用于边界检测

**续传日志**：

```typescript
const chunkRange = ChunkRangeCalculator.getChunkRange(
  fileSize,
  startOffset,
  chunkSize
);
postLogToBackend(
  `[SEND-SUMMARY] File: ${file.name}, offset: ${startOffset}, startChunk: ${chunkRange.startChunk}, endChunk: ${chunkRange.endChunk}`
);
```

### 续传的优势与限制

**优势**：

- **带宽节省**：避免重新传输已接收的数据
- **时间效率**：大文件传输中断后可快速恢复
- **用户体验**：网络波动不会导致传输进度完全丢失

**限制与注意点**：

- **文件一致性**：依赖文件内容未发生变化，续传前应验证文件大小/修改时间
- **存储位置**：仅在使用 File System Access API 选择保存目录时支持
- **浏览器兼容**：File System Access API 主要支持 Chrome/Edge，其他浏览器降级为内存存储

**调试支持**：

- **详细日志**：开发环境下记录续传起点、分片范围、预期传输量
- **错误处理**：文件访问失败时回退到从头开始传输
- **状态跟踪**：Store 层记录续传状态和实际接收大小
