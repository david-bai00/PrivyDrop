# PrivyDrop AI Playbook — 重连与状态一致性深度分析（中文）

← 返回流程入口：[`docs/ai-playbook/flows.zh-CN.md`](../flows.zh-CN.md)

（本页从 `docs/ai-playbook/flows.zh-CN.md` 拆分，保留原章节编号与内容。）

## 10）重连与状态一致性深度分析

### WebRTC 基础层重连机制

**双重断开检测架构**：

```typescript
// webrtc_base.ts
private isSocketDisconnected = false;  // Socket.IO 连接状态
private isPeerDisconnected = false;   // P2P 连接状态
private gracefullyDisconnectedPeers = new Set(); // 优雅断开的 peer 列表
```

**重连触发条件**：仅当 Socket.IO 和 P2P 连接都断开时才启动重连：

```typescript
// 避免重复重连：socket 断开 ≠ P2P 断开
if (
  this.isSocketDisconnected &&
  this.isPeerDisconnected &&
  !this.reconnectionInProgress
) {
  this.attemptReconnection();
}
```

### ICE 候选者队列管理

**候选者缓存策略**：

- **连接未就绪时**：候选者缓存到 `iceCandidatesQueue` Map，按 peerId 分组
- **连接就绪后**：批量处理缓存的候选者，按序添加到 RTCPeerConnection
- **失效处理**：候选者失效时重新入队，验证连接状态后重试

**实现细节**：

```typescript
private iceCandidatesQueue = new Map<string, RTCIceCandidate[]>();
// 缓存候选项直到连接就绪
if (dataChannel?.readyState !== 'open') {
  this.queueIceCandidate(candidate, peerId);
} else {
  this.addIceCandidate(candidate, peerId);
}
```

### 数据通道发送重试机制

**5 次重试策略**：

```typescript
async sendToPeer(data: string | ArrayBuffer, peerId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      dataChannel.send(data);
      return true;
    } catch (error) {
      if (this.gracefullyDisconnectedPeers.has(peerId)) {
        return false; // 跳过已优雅断开的 peer
      }
      if (attempt === 5) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 100)); // 100ms→1000ms
    }
  }
}
```

**重试间隔递增**：100ms → 200ms → 300ms → 400ms → 500ms，最大 5 次尝试

### 房间管理层的重连支持

**幂等性设计**：

- **长 ID 重连**：≥8 字符的 roomId 支持断线重连时复用房间
- **短 ID 限制**：4 位数字 ID 断线后需重新生成房间，避免冲突

**缓存 ID 重连优化**：

```typescript
// useRoomManager.ts
if (roomId.length >= 8) {
  // 长ID自动发送 initiator-online 信号
  this.sendInitiatorOnline();
}
```

**状态同步序列**：

1. **发送方重连**：`initiator-online` 信号通知接收方准备重建连接
2. **接收方响应**：`recipient-ready` 确认就绪状态
3. **WebRTC 协商**：重新开始 offer/answer/ICE 候选者交换
4. **传输恢复**：在新的 DataChannel 上恢复文件传输

### 状态一致性保证机制

**Store 层单一事实来源**：

```typescript
// fileTransferStore.ts
export const useFileTransferStore = create<TransferState>((set, get) => ({
  sendProgress: new Map(),
  receiveProgress: new Map(),
  // 提供清理 API 避免重复计数
  clearSendProgress: (fileId: string) =>
    set((state) => {
      const newProgress = new Map(state.sendProgress);
      newProgress.delete(fileId);
      return { sendProgress: newProgress };
    }),
}));
```

**连接状态机**：

```typescript
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

// 状态变更时触发相应处理
connectionStateChangeHandler(status: ConnectionStatus) {
  switch (status) {
    case 'connected':
      this.gracefullyDisconnectedPeers.clear(peerId);
      this.resetReconnectionState();
      break;
    case 'disconnected':
    case 'failed':
      this.cleanupExistingConnection(peerId);
      break;
  }
}
```

### 移动端优化策略

**唤醒锁管理**：

```typescript
// WakeLockManager
async requestWakeLock(): Promise<void> {
  try {
    this.wakeLock = await navigator.wakeLock.request('screen');
    this.wakeLock.addEventListener('release', () => {
      this.wakeLock = null;
    });
  } catch (error) {
    console.warn('Wake lock request failed:', error);
  }
}
```

**网络切换适应**：

- **连接检测**：监听 `connectionstatechange` 事件检测网络质量变化
- **自动重连**：`connectionState: 'disconnected' | 'failed' | 'closed'` 时均触发重连流程（统一走 attemptReconnection）
- **状态恢复**：重连成功后恢复房间状态和传输进度

**移动端后台/前台切换补充策略**：

- **socket 连接恢复自动入房**：`socket.on('connect')` 时，若已持有 `roomId` 且（`lastJoinedSocketId !== socket.id` 或 `!isInRoom`），则强制重新 `joinRoom(roomId, isInitiator, isInitiator)`；发送端会自动广播 `initiator-online`，接收端回复 `recipient-ready`。
- **身份追踪**：成功 `joinRoom` 后记录 `lastJoinedSocketId = socket.id`，用以检测“后台恢复时 socketId 更换”的情形。
- **门槛放宽**：`attemptReconnection` 只要满足“`roomId` 存在，且满足任一：P2P 断开 / socket 断开 / socketId 改变”，即可发起重连；不再强依赖“socket 与 P2P 同时断开”。

### 重连调试要点

**关键日志点**：

- **双重断开检测**：记录 Socket.IO 和 P2P 断开的具体时间戳
- **候选者队列**：统计缓存的 ICE 候选者数量和处理时间
- **发送重试**：记录重试次数、间隔和最终结果
- **状态恢复**：追踪 `initiator-online` → `recipient-ready` 的时序

**常见问题诊断**：

- **重复重连**：检查 `reconnectionInProgress` 标志和 `gracefullyDisconnectedPeers` 集合
- **候选者失效**：验证 `iceConnectionState` 和 `iceGatheringState` 状态
- **状态不一致**：确认 Store 层的进度清理和连接状态同步
