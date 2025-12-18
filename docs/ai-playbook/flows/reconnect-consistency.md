# PrivyDrop AI Playbook — Reconnect & State Consistency (Deep Dive)

← Back to flow index: [`docs/ai-playbook/flows.md`](../flows.md)

(This page is the English edition of content split out from `docs/ai-playbook/flows.zh-CN.md`, preserving the original section numbering and structure.)

## 10) Reconnect & State Consistency (Deep Dive)

### WebRTC Base-Layer Reconnect Mechanics

**Dual disconnect detection**:

```typescript
// webrtc_base.ts
private isSocketDisconnected = false;  // Socket.IO connection state
private isPeerDisconnected = false;   // P2P connection state
private gracefullyDisconnectedPeers = new Set(); // peers closed gracefully
```

**Reconnect trigger**: only start reconnection when both Socket.IO and P2P are disconnected:

```typescript
// Avoid duplicate reconnects: socket disconnect != P2P disconnect
if (
  this.isSocketDisconnected &&
  this.isPeerDisconnected &&
  !this.reconnectionInProgress
) {
  this.attemptReconnection();
}
```

### ICE Candidate Queue Management

**Candidate caching strategy**:

- **Before ready**: cache candidates in the `iceCandidatesQueue` Map, grouped by peerId
- **After ready**: flush cached candidates and add them to RTCPeerConnection in order
- **Invalid handling**: re-queue invalid candidates and retry after validating connection state

**Implementation detail**:

```typescript
private iceCandidatesQueue = new Map<string, RTCIceCandidate[]>();
// Cache candidates until the connection is ready
if (dataChannel?.readyState !== 'open') {
  this.queueIceCandidate(candidate, peerId);
} else {
  this.addIceCandidate(candidate, peerId);
}
```

### DataChannel Send-Retry Mechanism

**5-attempt retry policy**:

```typescript
async sendToPeer(data: string | ArrayBuffer, peerId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      dataChannel.send(data);
      return true;
    } catch (error) {
      if (this.gracefullyDisconnectedPeers.has(peerId)) {
        return false; // skip peers that were closed gracefully
      }
      if (attempt === 5) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 100)); // 100ms→1000ms
    }
  }
}
```

**Backoff**: 100ms → 200ms → 300ms → 400ms → 500ms, up to 5 attempts

### Room-Layer Reconnect Support

**Idempotency**:

- **Long IDs**: roomId length ≥ 8 supports room reuse across reconnects
- **Short IDs**: 4-digit numeric IDs must be re-generated after disconnect to avoid collisions

**Cached-ID reconnect optimization**:

```typescript
// useRoomManager.ts
if (roomId.length >= 8) {
  // long IDs auto-send initiator-online
  this.sendInitiatorOnline();
}
```

**State sync sequence**:

1. **Initiator reconnects**: sends `initiator-online` to signal readiness
2. **Recipient replies**: `recipient-ready` confirms readiness
3. **WebRTC negotiation**: re-run offer/answer/ICE exchange
4. **Transfer continues**: resume file transfer on the new DataChannel

### State Consistency Safeguards

**Store as the single source of truth**:

```typescript
// fileTransferStore.ts
export const useFileTransferStore = create<TransferState>((set, get) => ({
  sendProgress: new Map(),
  receiveProgress: new Map(),
  // cleanup APIs to avoid double counting
  clearSendProgress: (fileId: string) =>
    set((state) => {
      const newProgress = new Map(state.sendProgress);
      newProgress.delete(fileId);
      return { sendProgress: newProgress };
    }),
}));
```

**Connection state machine**:

```typescript
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

// react to state transitions
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

### Mobile Optimizations

**Wake lock management**:

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

**Adapting to network changes**:

- **Detection**: listen to `connectionstatechange` to infer network quality changes
- **Auto-reconnect**: `connectionState: 'disconnected' | 'failed' | 'closed'` all route into the same reconnect path (attemptReconnection)
- **Restore state**: after reconnect, restore room status and transfer progress

**Mobile background/foreground addendum**:

- **Auto re-join on socket reconnect**: on `socket.on('connect')`, if a `roomId` exists and (`lastJoinedSocketId !== socket.id` or `!isInRoom`), force `joinRoom(roomId, isInitiator, isInitiator)`. The initiator auto-broadcasts `initiator-online`; the recipient replies `recipient-ready`.
- **Identity tracking**: after a successful `joinRoom`, record `lastJoinedSocketId = socket.id` to detect “socketId changed after background resume”.
- **Lowered threshold**: `attemptReconnection` can start as long as `roomId` exists and any of the following hold: P2P disconnected / socket disconnected / socketId changed. It no longer requires “socket and P2P disconnected at the same time”.

### Reconnect Debugging Notes

**Key log points**:

- **Dual disconnect detection**: record timestamps for Socket.IO vs P2P disconnects
- **Candidate queue**: count cached ICE candidates and flush durations
- **Send retries**: record retry attempts, delays, and the final result
- **State restoration**: trace `initiator-online` → `recipient-ready` ordering

**Common diagnostics**:

- **Duplicate reconnects**: check `reconnectionInProgress` and the `gracefullyDisconnectedPeers` set
- **Invalid candidates**: validate `iceConnectionState` and `iceGatheringState`
- **State divergence**: confirm store progress cleanup and connection-state synchronization

