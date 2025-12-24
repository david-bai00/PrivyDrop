# PrivyDrop AI Playbook — 流程（含微方案模板，中文）

本文汇总 P2P 传输与信令重连的关键流程与消息序列，并给出简明的调试要点与“微方案模板”。用于在改动前快速对齐阶段、事件与入口文件。

## 快速导航

- 速查：本页包含 1–5（关键流程/消息/调试要点）与 11（微方案模板）。
- 深度阅读（已从本页拆分）：
  - 前端组件协作（原第 6 节）：[`docs/ai-playbook/flows/frontend.zh-CN.md`](./flows/frontend.zh-CN.md)
  - 背压与分片（原第 7 节）：[`docs/ai-playbook/flows/backpressure-chunking.zh-CN.md`](./flows/backpressure-chunking.zh-CN.md)
  - 断点续传（原第 9 节）：[`docs/ai-playbook/flows/resume.zh-CN.md`](./flows/resume.zh-CN.md)
  - 重连一致性（原第 10 节）：[`docs/ai-playbook/flows/reconnect-consistency.zh-CN.md`](./flows/reconnect-consistency.zh-CN.md)

## 1）文件传输（单文件）

序列（通过 DataChannel，发送端 ↔ 接收端）：

1. 发送端 → `fileMetadata`（id、name、size、type、fullName、folderName）。
2. 接收端 → `fileRequest`（确认元信息；支持 offset 续传）。
3. 发送端 → 分片流（高性能双层缓冲架构）：
   - StreamingFileReader 使用 32MB 批次读取 + 64KB 网络块发送
   - NetworkTransmitter 使用 WebRTC 原生背压控制（bufferedAmountLowThreshold）
   - 发送时嵌入元数据（chunkIndex、totalChunks、fileOffset、fileId）
4. 接收端 → 完整性检查与组装（严格顺序写入或内存组装，支持断点续传）。
5. 接收端 → `fileReceiveComplete`（成功回执，包含 receivedSize）。
6. 发送端 → MessageHandler 触发 100% 进度回调，清理发送状态。

发送侧详细流程：

1. FileTransferOrchestrator.sendFileMeta() → StateManager 记录文件夹文件大小
2. 接收 fileRequest → FileTransferOrchestrator.handleFileRequest()
3. 初始化 StreamingFileReader（支持 startOffset 续传）
4. processSendQueue() 循环：
   - getNextNetworkChunk() 获取 64KB 块（批次内高效切片）
   - NetworkTransmitter.sendEmbeddedChunk() 背压控制发送
   - ProgressTracker.updateFileProgress() 更新进度和速度
5. 等待 fileReceiveComplete 确认，清理 isSending 状态

入口：

- 发送侧：`frontend/lib/fileSender.ts`（兼容层）→ `frontend/lib/transfer/FileTransferOrchestrator.ts`（主编排器）
- 关键组件：StreamingFileReader（高性能读取）、NetworkTransmitter（背压发送）、StateManager（状态管理）、ProgressTracker（进度计算）

接收侧详细流程：

1. MessageProcessor.handleFileMetadata() → ReceptionStateManager 记录文件元数据
2. FileReceiveOrchestrator.requestFile() → 检查断点续传（getPartialFileSize）
3. 初始化接收：计算期望分片数，根据文件大小选择存储方式（内存 vs 磁盘）
4. 发送 fileRequest（带 offset 参数）→ 等待发送端开始传输
5. handleBinaryChunkData() 循环：
   - ChunkProcessor.convertToArrayBuffer() 处理多种数据格式（Blob/Uint8Array/ArrayBuffer）
   - ChunkProcessor.parseEmbeddedChunkPacket() 解析嵌入元数据包格式
   - ChunkProcessor.validateChunk() 验证 fileId、chunkIndex、chunkSize
   - 存储分片到 chunks 数组（或通过 SequencedDiskWriter 顺序写入磁盘）
   - ProgressReporter.updateFileProgress() 节流更新进度（100ms 间隔）
6. 自动完成检测：checkAndAutoFinalize() 验证分片完整性
7. 根据存储方式选择最终化：
   - 大文件/磁盘存储：StreamingFileWriter.finalizeWrite()
   - 小文件/内存存储：FileAssembler.assembleFileFromChunks()
8. 发送 fileReceiveComplete 确认，包含 receivedSize 和 receivedChunks

入口：

- 发送侧：`frontend/lib/fileSender.ts`（兼容层）→ `frontend/lib/transfer/FileTransferOrchestrator.ts`（主编排器）
- 接收侧：`frontend/lib/fileReceiver.ts`（兼容层）→ `frontend/lib/receive/FileReceiveOrchestrator.ts`（主编排器）
- 关键组件：StreamingFileReader（高性能读取）、NetworkTransmitter（背压发送）、ChunkProcessor（格式处理）、StreamingFileWriter（磁盘写入）、FileAssembler（内存组装）

备注：

- **发送侧**：双层缓冲架构（32MB 批次+64KB 网络块），WebRTC 原生背压控制，支持断点续传
- **接收侧**：严格顺序写入机制（SequencedDiskWriter），支持多种数据格式转换，智能存储选择（≥1GB 文件自动磁盘存储）
- **兼容性处理**：ChunkProcessor 支持 Blob/Uint8Array/ArrayBuffer 多种格式，解决 Firefox 兼容性问题
- **进度节流**：ProgressReporter 使用不同频率更新（文件 100ms，文件夹 200ms），避免 UI 过载
- **断点续传**：通过 getPartialFileSize() 检查本地部分文件，fileRequest.offset 参数指定续传位置
- **调试支持**：ReceptionConfig 提供详细的分片日志和进度日志，便于问题排查

## 2）文件传输（文件夹）

序列（对文件逐个进行单文件流程）：

1. 发送端 → 发送文件夹内全部文件的 `fileMetadata`。
2. 接收端 → `folderRequest`（确认开始批量传输）。
3. 每个文件：按“单文件流程”执行，但单个文件完成时不标记全局 100%。
4. 接收端 → 所有文件完成后发送 `folderReceiveComplete`。
5. 发送端 → 将文件夹整体进度标记为 100%（触发最终回调）。

## 3）信令与重连（Socket.IO）

高层序列：

1. 客户端 → REST：创建或获取 `roomId`（`backend/src/routes/api.ts`）。
2. 客户端 → Socket.IO：`join` 房间（后端校验并绑定 socket 到房间）。
3. 在房间内进行在线状态与重连协作：
   - 发起方 → `initiator-online`（上线/就绪，通知对端可重建连接）。
   - 接收方 → `recipient-ready`（表示就绪；发起方可发起 offer）。
4. WebRTC 协商转发：
   - `offer` → 后端 → 转发给对端。
   - `answer` → 后端 → 转发给对端。
   - `ice-candidate` → 后端 → 转发给对端。

### Join 成功条件与超时策略（前端容错增强）

- 首选成功条件：收到 `joinResponse(success=true)`（后端完成房间校验与 socket↔room 绑定）。
- 等效成功信号（容错，任一满足即判定已入房并清理监听/定时器）：
  - 发起方（Initiator）：收到 `ready` 或 `recipient-ready`；
  - 接收方（Recipient）：收到 `offer`。
- 超时时间：15 秒。用于兼容弱网、移动端与 Socket.IO 轮询降级造成的 joinResponse 迟到。
- 说明：`ready/recipient-ready` 为房间广播事件，`offer` 为点对点握手起点；能收到这些事件即表明“已在房间且握手已开始”，可视为等效成功，避免“Join room timeout”的误报。

重连机制细节（移动端网络切换支持）：

- **双重断开检测**：Socket.IO 断开触发 `disconnect` 事件 → 标记 `isSocketDisconnected = true`；P2P 连接断开触发 `disconnected` 状态 → 标记 `isPeerDisconnected = true`，自动调用 `cleanupExistingConnection()` 清理资源
- **重连触发条件**：仅当 socket 和 P2P 都断开时才启动重连 → `attemptReconnection()`，防止重复重连；使用 `reconnectionInProgress` 标志防止并发重连
- **状态恢复机制**：重连时调用 `joinRoom(roomId, isInitiator, sendInitiatorOnline)` 恢复状态，发送方自动发送 `initiator-online` 信号，接收方响应 `recipient-ready`
- **ICE 候选者队列机制**：连接未就绪时缓存候选者到 `iceCandidatesQueue` Map，连接就绪后批量处理；支持候选者失效时的重新入队和连接状态验证
- **唤醒锁管理**：连接建立时通过 `WakeLockManager` 请求屏幕唤醒锁，连接断开时释放，优化移动端传输稳定性
- **优雅断开跟踪**：`gracefullyDisconnectedPeers` Set 跟踪正常断开的 peer，发送重试时跳过这些 peer，避免不必要的重试
- **数据通道发送重试**：5 次重试机制，间隔从 100ms 递增到 1000ms，支持 `gracefullyDisconnectedPeers` 检测跳过重试

**后端信令与房间管理**：

Socket.IO 事件处理流程：

1. **join 事件**：IP 限流检查 → 房间存在性验证 → socket-room 绑定 → 成功响应 → 广播 `ready` 通知新用户加入
2. **重连状态同步**：发送方重连时发送 `initiator-online` 信号，接收方响应 `recipient-ready` 确认就绪状态
3. **信令转发**：offer/answer/ice-candidate 直接通过 `socket.to(peerId).emit()` 转发给目标客户端，包含 from 字段标识发送者
4. **断开清理**：广播 `peer-disconnected` → 解绑 socket-room 关系 → 空房间 15 分钟后删除

**房间管理机制**：

- Redis 数据结构：
  - `room:<roomId>` (Hash): 存储房间创建时间
  - `room:<roomId>:sockets` (Set): 管理房间内 socket 连接
  - `socket:<socketId>` (String): 存储 socket 对应的 roomId
- ID 生成策略：优先 4 位数字 ID，冲突时切换到 4 位字母数字 ID
- 幂等设计：长 ID(≥8 字符)支持重连时的房间复用
- TTL 管理：24 小时过期，活动时自动刷新

**限流保护**：

- 基于 Redis Sorted Set 实现 IP 限流
- 5 秒时间窗口最多允许 2 次请求
- 使用 pipeline 确保原子性操作

入口：

- 前端：`frontend/hooks/useWebRTCConnection.ts`、`frontend/lib/webrtc_base.ts`、`frontend/lib/webrtc_Initiator.ts`、`frontend/lib/webrtc_Recipient.ts`。
- 后端：`backend/src/socket/handlers.ts`（全部信令事件）、`backend/src/services/room.ts`、`backend/src/routes/api.ts`。

## 4）DataChannel 消息与约束（概览）

- 消息（示例命名）：`fileMetadata`、`fileRequest`、`chunk`、`fileReceiveComplete`、`folderRequest`、`folderReceiveComplete`，以及可能的流控/保活。
- 核心字段：文件/文件夹 id、索引/范围、大小、名称、可选校验信息。
- 关键约束：
  - 分片大小：按浏览器/网络选择安全范围；注意通道缓冲阈值。
  - 背压：检查 `RTCDataChannel.bufferedAmount` 并按需节流。
  - 完成：仅在收到 `fileReceiveComplete`/`folderReceiveComplete` 后标记 100%。
  - 续传：`fileRequest` 可设计为带 offset/range 以支持续传。

## 5）调试要点（凝练自历史经验）

- 下载竞争/重复计数：以 `frontend/stores/fileTransferStore.ts` 为单一事实来源；在 Store 层提供清理 API（如 `clearSendProgress`、`clearReceiveProgress`），避免组件本地删除对象导致重复计数。
- 接收方重连与房间状态：正确的状态重置；UI 严格来源于 Store；离开/重进需清理相关状态；遵循 `initiator-online`/`recipient-ready` 的时序再发起 offer；重连后校验房间成员关系。
- 缓存 roomId 的重连：若存在缓存 `roomId`，确保依赖在线状态同步（`initiator-online`/`recipient-ready`）触发重新协商；后端需保证 socket↔room 映射在断开/重连路径上被正确清理与恢复。
- 多次传输计数：避免过度“去重”掩盖真实的二次下载；依赖正确的状态清理。
- 数据流原则：单向数据流（Store → Hooks → Components）；Hooks 做适配，组件只消费不修改。
- **实用调试策略**：
  - 为连接状态变化与 Store 更新添加结构化日志；遇到时序/竞态可用 `setTimeout(..., 0)` 调整更新顺序
  - DataChannel 发送重试机制：`sendToPeer()` 支持 5 次重试，间隔 100ms→1000ms 递增；优雅断开的 peer 跳过重试
  - WebRTC 数据类型兼容性：支持 `ArrayBuffer`/`Blob`/`Uint8Array`/`TypedArray` 多种格式，解决 Firefox 兼容性问题
  - 连接状态监控：`connectionState` 变化时触发相应的处理逻辑（connected/disconnected/failed/closed）
  - 背压控制：DataChannel 设置 `bufferedAmountLowThreshold = 256KB`，发送时检查 `bufferedAmount` 状态
  - Join 误报识别：若出现“Join room timeout”但紧接着能看到 `offer/answer/connected` 等日志，通常是 joinResponse 迟到所致，并非真实失败；15 秒超时窗口与“等效成功信号”会自动纠偏。

## 6）前端组件系统与业务中枢协作流程

本节已拆分到：[`docs/ai-playbook/flows/frontend.zh-CN.md`](./flows/frontend.zh-CN.md)

```
App Router (page.tsx/layout.tsx)
    ↓
HomeClient (页面布局与SEO)
    ↓
ClipboardApp (顶层UI协调器)
    ↓
SendTabPanel/RetrieveTabPanel (功能面板)
    ↓
业务中枢 Hooks (状态管理与业务逻辑)
    ↓
Core Services (webrtcService) + Store (fileTransferStore)
```

### ClipboardApp 顶层协调器模式

**核心职责**：

- 集成 5 个关键业务 hooks：useWebRTCConnection、useFileTransferHandler、useRoomManager、usePageSetup、useClipboardAppMessages
- 全局拖拽事件处理：dragenter/dragleave/dragover/drop，支持多文件和文件夹树遍历
- 双标签页状态管理：发送/接收面板切换，通过 activeTab 控制
- 统一消息系统：shareMessage/retrieveMessage 4 秒自动消失机制

### Hook 层级与职责分离

**useWebRTCConnection**（状态桥梁）：

- 计算全局传输状态（isAnyFileTransferring）
- 暴露 webrtcService 方法（broadcastDataToAllPeers、requestFile、requestFolder）
- 提供连接重置方法（resetSenderConnection、resetReceiverConnection）

**useFileTransferHandler**（文件与内容管理）：

- 文件操作：addFilesToSend（去重）、removeFileToSend
- 下载功能：handleDownloadFile（支持文件夹压缩下载）
- 关键修复：使用 `useFileTransferStore.getState()` 获取最新状态，避免闭包问题
- 重试机制：最大 3 次重试，50ms 间隔，详细错误日志

**useRoomManager**（房间生命周期管理）：

- 房间操作：joinRoom（支持缓存 ID 重连）、processRoomIdInput（750ms 防抖）
- 离开保护：传输中确认提示（isAnyFileTransferring 检查）
- 状态文本：动态更新房间状态文本
- 链接生成：自动生成分享链接

**usePageSetup**（页面初始化）：

- 国际化消息加载与错误处理
- URL 参数处理：roomId 自动提取并触发加入房间（200ms 延迟确保 DOM 就绪）
- 引荐来源追踪（trackReferrer）

**useClipboardAppMessages**（消息管理）：

- 分离式消息状态：shareMessage（发送相关）和 retrieveMessage（接收相关）
- 统一消息显示接口：putMessageInMs(message, isShareEnd, displayTimeMs)
- 自动清理机制：4 秒后自动清空消息状态

### 面板组件特化设计

**SendTabPanel 发送面板**：

- 房间 ID 双模式生成：4 位数字（后端 API 生成）和 UUID（前端 crypto API）
- 富文本编辑器集成（动态导入，SSR 禁用）
- 文件上传处理和文件列表管理
- 分享链接生成与二维码显示

**RetrieveTabPanel 接收面板**：

- File System Access API 集成：目录选择和直接保存到磁盘
- 富文本内容渲染（dangerouslySetInnerHTML）
- 文件请求和下载状态管理
- 保存位置选择和大文件/文件夹提示

**FileListDisplay 文件列表**：

- 智能文件/文件夹分组和统计显示
- 多浏览器下载策略：Chrome 自动下载，其他浏览器手动保存提示
- 下载计数统计和传输进度跟踪
- 断点续传和存储方式显示（内存/磁盘）

### 关键用户体验优化

1. **下载状态闭包修复**：`useFileTransferHandler.ts:110` 使用 `useFileTransferStore.getState()` 获取最新状态
2. **房间 ID 输入防抖**：`useRoomManager.ts:247` 使用 lodash debounce 750ms 延迟验证
3. **传输中离开保护**：`useRoomManager.ts:164,218` 检查 `isAnyFileTransferring` 状态并显示确认对话框
4. **缓存 ID 重连**：`useRoomManager.ts:91` 检测长 ID（≥8 字符）自动发送 `initiator-online`
5. **文件夹压缩下载**：`useFileTransferHandler.ts:89` 使用 JSZip 动态创建 ZIP 文件
6. **全局拖拽优化**：ClipboardApp 使用 dragCounter 防止拖拽状态误判，支持 webkitGetAsEntry 文件树遍历
7. **剪贴板兼容性**：useClipboardActions 支持现代 navigator.clipboard API 和 document.execCommand 降级方案
8. **富文本安全处理**：useRichTextToPlainText 服务端渲染安全，客户端 DOM 转换处理块级元素
9. **站内导航不中断（同一标签页）**：依赖 `frontend/stores/fileTransferStore.ts`（Zustand 单例）与 `frontend/lib/webrtcService.ts`（服务单例）。App Router 页面切换不打断传输且保留已选择/已接收内容。注意不要在路由切换副作用中调用 `webrtcService.leaveRoom()` 或重置 Store；刷新/新标签不在保证范围内。

## 7）SSR 与 DOM 访问防护（必读）

为避免“服务端异常（Application error）”这类 SSR 侧报错，前端改动需遵循以下守卫清单：

- 仅在客户端生命周期中访问 DOM/Navigator
  - 将 `document/window/navigator` 的访问放入 `useEffect`、事件回调或显式的客户端组件（文件顶部包含 `"use client";`）。
  - 在回调内使用前加守卫：`typeof document !== 'undefined'`、`typeof window !== 'undefined'`、`typeof navigator !== 'undefined'`。
- 定时器与可见性判断
  - 使用全局 `setTimeout`/`clearTimeout`，避免直接引用 `window.setTimeout`。
  - 监听可见性：注册/移除 `visibilitychange` 事件前先判断 `typeof document !== 'undefined'`。
- 事件监听的清理
  - 所有 `addEventListener` 都应在 `useEffect` 返回函数中对称 `removeEventListener`，并在服务端（无 `document`）时跳过注册。
- 单例与模块副作用（重要）
  - 禁止在模块顶层初始化依赖浏览器环境的实例（如 Socket、WebRTC、WakeLock 等）。应在客户端首次需要时惰性创建（lazy-init）。

参考实现：

- `frontend/utils/useOneShotSlowHint.ts`：在 `useEffect` 中对 `document` 做判空；定时器使用全局 `setTimeout`。
- `frontend/hooks/useConnectionFeedback.ts`：读取 `document.visibilityState` 前判空；仅在客户端注册 `visibilitychange`。
- `frontend/hooks/usePageSetup.ts`、`frontend/lib/tracking.ts`：读取 `window.location` 前判空。

### UI 连接反馈状态机（弱网/VPN 提示）

- 入房阶段（join）
  - 立即：`join_inProgress`（“正在加入房间…”）。
  - 3s 未完成：`join_slow`（“连接较慢，建议检查网络/VPN…”）。
  - 15s 超时：`join_timeout`（“加入超时…”）。
  - 等效成功信号：在等待 `joinResponse` 期间，若收到 `ready/recipient-ready/offer`，视为提前入房成功并即时清理 3s/15s 定时器与提示，避免“成功后再出现慢/超时提示”。
- 协商阶段（WebRTC）
  - 进入 `new/connecting`：归一为 “协商中” → `rtc_negotiating`。
  - 8s 未连上：`rtc_slow`（“网络可能受限，尝试关闭 VPN 或稍后再试”）。仅在页面前台可见时触发；同一次协商尝试仅提示一次（发送端/接收端任一进入协商即启动计时，提示归属以最先进入协商的一侧为准）。
- 连接与重连
  - 首次 `connected`：`rtc_connected`（仅一次）。
  - 前台断开：`rtc_reconnecting` → 恢复后 `rtc_restored`。
  - 后台断开不提示；回到前台若仍断开立即提示 `rtc_reconnecting`。
  - 已断开期间若页面在后台，返回前台时若仍处于协商态且此前触发了慢协商计时，则会补发一次 `rtc_slow` 并标记本次协商已提示，以避免重复。

实现位置：

- `frontend/hooks/useRoomManager.ts`：入房阶段提示与定时器管理（3s 慢网、15s 超时），并在 join 成功/失败时清理定时器；支持“等效成功信号”提前判定成功（`ready/recipient-ready/offer`）。
- `frontend/hooks/useConnectionFeedback.ts`：桥接 WebRTC 连接态到 UI 提示。
  - 状态归一化（mapPhase）：`new/connecting`→`negotiating`；`failed/closed`→`disconnected`。
  - 协商慢提示：8s 定时器、前后台可见性节制、单次协商尝试仅提示一次（含挂起 → 前台补发）。
  - 一次性提示：首次 `connected` 只显示一次；断开 → 恢复显示 `rtc_restored`；仅前台显示 `rtc_reconnecting`。
  - 复用：慢提示定时与前后台补发由 `frontend/utils/useOneShotSlowHint.ts` 统一实现；状态归一化由 `frontend/utils/rtcPhase.ts` 提供。

文案与 i18n：

- 文案键均位于 `frontend/constants/messages/*.{ts}`，类型定义见 `frontend/types/messages.ts`。
- 关键键：`join_inProgress`、`join_slow`、`join_timeout`、`rtc_negotiating`、`rtc_slow`、`rtc_connected`、`rtc_reconnecting`、`rtc_restored`（已在 en/ja/es/de/fr/ko 全部补齐）。

节流与展示：

- 所有提示默认 4–6 秒自动消失；通过 `useClipboardAppMessages.putMessageInMs(message, isShareEnd, ms)` 统一展示。
- 连接反馈提示在“状态迁移 + ever/wasDisc 标记 + 可见性判断”三重约束下触发，避免提示风暴。

10. **切到接收端自动加入（缓存 ID）**：当用户切换到接收端、未在房间、URL 无 `roomId`、输入框为空且本地存在缓存 ID 时，自动填充并直接调用加入房间以提升体验。入口：`frontend/components/ClipboardApp.tsx`（监听 `activeTab` 变化，读取 `frontend/lib/roomIdCache.ts`）。
11. **发送端“使用缓存 ID”即刻加入**：发送端在 `SendTabPanel` 点击“使用缓存 ID”后会立即调用加入房间（而非仅填充输入框）。入口：`frontend/components/ClipboardApp/CachedIdActionButton.tsx`（`onUseCached` 回调）+ `frontend/components/ClipboardApp/SendTabPanel.tsx`。
12. **深色主题切换**：提供单按钮 Light/Dark 切换，入口：`frontend/components/web/ThemeToggle.tsx`；集成位置：`frontend/components/web/Header.tsx`（桌面与移动）；局部样式从硬编码颜色迁移为设计令牌（例如接收面板使用 `bg-card text-card-foreground`）。

### 前端组件架构特化

**富文本编辑器模块**：

- **RichTextEditor**：主编辑器组件，支持 contentEditable、图片粘贴、格式化工具、SSR 禁用
- **工具栏组件分离**：BasicFormatTools（粗体/斜体/下划线）、FontTools（字体/大小/颜色）、AlignmentTools（对齐）、InsertTools（链接/图片/代码块）
- **类型安全设计**：完整的 TypeScript 类型定义（FormatType、AlignmentType、FontStyleType、CustomClipboardEvent）
- **编辑器 Hooks**：useEditorCommands（命令执行）、useSelection（选择管理）、useStyleManagement（样式管理）

**网站页面组件设计**：

- **Header 响应式导航**：桌面端水平导航+移动端汉堡菜单，集成 GitHub 链接和语言切换器
- **Footer 国际化**：动态版权年份、多语言支持链接显示，使用 languageDisplayNames 配置
- **FAQSection 灵活配置**：支持工具页面/独立页面切换、标题级别控制、自动 FAQ 数组生成
- **内容展示组件**：HowItWorks（步骤动画+视频）、SystemDiagram（架构图）、KeyFeatures（图标+特性说明）

**UI 组件库架构**：

- **基于 Radix UI**：Button（CVA 多变体系统）、Accordion（手风琴）、Dialog（模态对话框）、Select、DropdownMenu
- **设计系统一致性**：统一的 cn 工具函数、主题色彩系统、动画过渡效果
- **组件组合模式**：DialogHeader/DialogFooter/DialogTitle/DialogDescription 组合设计
- **懒加载优化**：LazyLoadWrapper 使用 react-intersection-observer，支持 rootMargin 配置防止布局跳动

**通用组件工具化**：

- **clipboard_btn**：WriteClipboardButton/ReadClipboardButton 分离设计，集成 useClipboardActions hook，支持国际化消息
- **TableOfContents**：支持中文标题 ID 生成、滚动跟踪、层级缩进、IntersectionObserver 监听
- **JsonLd SEO**：多类型数据支持、suppressHydrationWarning、数组/单对象处理
- **AutoPopupDialog/YouTubePlayer**：业务场景封装，复用性设计

### 数据流模式

- **单向数据流**：Store → Hooks → Components
- **状态管理集中化**：所有状态通过 `useFileTransferStore` 统一管理
- **错误处理标准化**：统一的消息提示机制（putMessageInMs）
- **国际化集成**：useLocale + getDictionary 提供多语言支持

## 8）背压与分片策略深度分析

本节已拆分到：[`docs/ai-playbook/flows/backpressure-chunking.zh-CN.md`](./flows/backpressure-chunking.zh-CN.md)

- 适用：核对背压阈值、分片/批次策略、嵌入元数据包格式与性能调优点
- 包含：发送侧双层缓冲、接收侧存储策略、调试与监控建议等

## 9）断点续传深度分析

本节已拆分到：[`docs/ai-playbook/flows/resume.zh-CN.md`](./flows/resume.zh-CN.md)

- 适用：核对续传检测、offset 协商与分片范围计算的一致性
- 包含：ChunkRangeCalculator、接收侧/发送侧续传流程、限制与调试要点等

## 10）重连与状态一致性深度分析

本节已拆分到：[`docs/ai-playbook/flows/reconnect-consistency.zh-CN.md`](./flows/reconnect-consistency.zh-CN.md)

- 适用：核对 WebRTC/Socket 双重断开判定、ICE 候选者队列、发送重试与一致性保障
- 包含：重连触发条件、重试策略、移动端补充策略、调试要点等

## 11）微方案模板（用于小改动前的对齐）

标题：<简述>

背景/问题

- 要解决的用户场景或缺陷是什么？

目标与非目标

- 本次改动包含与不包含的范围？

影响文件与消息

- 代码：列出关键文件（如 `frontend/lib/webrtc_base.ts`、`backend/src/socket/handlers.ts`）。
- 协议：列出将修改的 DataChannel 消息/字段。

状态机/流程变化

- 增删改的阶段；给出简要时序或步骤。

测试与回归清单

- 单测/集成（如适用）、手测场景、性能/边界、重连。

需要更新的文档

- `code-map.md`（如出现新的入口）
- `flows.md`（流程/消息/约束变化）
- 相关架构或部署文档（如涉及）
