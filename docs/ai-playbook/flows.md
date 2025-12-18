# PrivyDrop AI Playbook — Flows (with Micro-Plan Template)

This page summarizes the core P2P transfer flows and signaling/reconnection sequences, plus practical debugging notes and a compact “micro-plan template”. Use it to align on phases, events, and entry points before making changes.

## Quick Navigation

- Fast path: this page contains 1–5 (key flows/messages/debug notes) and 11 (micro-plan template).
- Deep dives (split out from this page):
  - Frontend component collaboration (was Section 6): [`docs/ai-playbook/flows/frontend.md`](./flows/frontend.md)
  - Backpressure & chunking (was Section 7): [`docs/ai-playbook/flows/backpressure-chunking.md`](./flows/backpressure-chunking.md)
  - Resume / partial transfer (was Section 9): [`docs/ai-playbook/flows/resume.md`](./flows/resume.md)
  - Reconnect consistency (was Section 10): [`docs/ai-playbook/flows/reconnect-consistency.md`](./flows/reconnect-consistency.md)

## 1) File Transfer (Single File)

Sequence (via DataChannel, sender ↔ receiver):

1. Sender → `fileMetadata` (id, name, size, type, fullName, folderName).
2. Receiver → `fileRequest` (ack metadata; supports offset-based resume).
3. Sender → chunk stream (high-performance, dual-layer buffering):
   - StreamingFileReader reads in 32MB batches and sends 64KB network chunks
   - NetworkTransmitter uses native WebRTC backpressure (bufferedAmountLowThreshold)
   - Each send embeds metadata (chunkIndex, totalChunks, fileOffset, fileId)
4. Receiver → integrity checks & assembly (strict sequential disk writes or in-memory assembly; supports resume).
5. Receiver → `fileReceiveComplete` (success receipt, includes receivedSize).
6. Sender → MessageHandler fires 100% progress callback and clears sending state.

Sender-side detailed flow:

1. FileTransferOrchestrator.sendFileMeta() → StateManager records folder/file sizes
2. Receive `fileRequest` → FileTransferOrchestrator.handleFileRequest()
3. Initialize StreamingFileReader (supports startOffset resume)
4. processSendQueue() loop:
   - getNextNetworkChunk() returns the next 64KB chunk (efficient slicing within a batch)
   - NetworkTransmitter.sendEmbeddedChunk() sends with backpressure control
   - ProgressTracker.updateFileProgress() updates progress and speed
5. Wait for `fileReceiveComplete`, then clear isSending state

Entry points:

- Sender: `frontend/lib/fileSender.ts` (compat wrapper) → `frontend/lib/transfer/FileTransferOrchestrator.ts` (main orchestrator)
- Key components: StreamingFileReader (fast reads), NetworkTransmitter (backpressure sending), StateManager (state), ProgressTracker (progress)

Receiver-side detailed flow:

1. MessageProcessor.handleFileMetadata() → ReceptionStateManager stores file metadata
2. FileReceiveOrchestrator.requestFile() → check resume (getPartialFileSize)
3. Initialize reception: compute expected chunk count; choose storage mode (memory vs disk) based on size
4. Send `fileRequest` (with offset if needed) → wait for sender to start
5. handleBinaryChunkData() loop:
   - ChunkProcessor.convertToArrayBuffer() handles multiple payload types (Blob/Uint8Array/ArrayBuffer)
   - ChunkProcessor.parseEmbeddedChunkPacket() parses the “embedded metadata” packet format
   - ChunkProcessor.validateChunk() validates fileId, chunkIndex, chunkSize
   - Store chunks in an array (or write sequentially via SequencedDiskWriter)
   - ProgressReporter.updateFileProgress() throttles progress updates (100ms)
6. Auto completion detection: checkAndAutoFinalize() validates completeness
7. Finalize based on storage mode:
   - Large/disk: StreamingFileWriter.finalizeWrite()
   - Small/memory: FileAssembler.assembleFileFromChunks()
8. Send `fileReceiveComplete` with receivedSize and receivedChunks

Entry points:

- Sender: `frontend/lib/fileSender.ts` (compat wrapper) → `frontend/lib/transfer/FileTransferOrchestrator.ts` (main orchestrator)
- Receiver: `frontend/lib/fileReceiver.ts` (compat wrapper) → `frontend/lib/receive/FileReceiveOrchestrator.ts` (main orchestrator)
- Key components: StreamingFileReader (fast reads), NetworkTransmitter (backpressure), ChunkProcessor (format handling), StreamingFileWriter (disk writes), FileAssembler (memory assembly)

Notes:

- **Sender**: dual-layer buffering (32MB batches + 64KB network chunks), native WebRTC backpressure, resume support
- **Receiver**: strict sequential disk writer (SequencedDiskWriter), multi-format conversion, smart storage selection (≥1GB auto disk mode)
- **Compatibility**: ChunkProcessor supports Blob/Uint8Array/ArrayBuffer to address Firefox quirks
- **Progress throttling**: ProgressReporter updates at different rates (file 100ms, folder 200ms) to avoid UI overload
- **Resume**: getPartialFileSize() checks local partial files; fileRequest.offset drives resume
- **Debug support**: ReceptionConfig provides verbose chunk/progress logs for investigation

## 2) File Transfer (Folder)

Sequence (run the single-file flow for each file):

1. Sender → send `fileMetadata` for all files in the folder.
2. Receiver → `folderRequest` (confirm starting the batch transfer).
3. For each file: run the single-file flow, but do not mark global 100% on individual file completion.
4. Receiver → after all files finish, send `folderReceiveComplete`.
5. Sender → mark folder-level progress as 100% (fire final callback).

## 3) Signaling & Reconnect (Socket.IO)

High-level sequence:

1. Client → REST: create or fetch a `roomId` (`backend/src/routes/api.ts`).
2. Client → Socket.IO: `join` the room (backend validates and binds socket ↔ room).
3. Online state & reconnection coordination within the room:
   - Initiator → `initiator-online` (online/ready; tells the peer it can rebuild the connection).
   - Recipient → `recipient-ready` (ready; initiator may start offer).
4. WebRTC negotiation relay:
   - `offer` → backend → peer.
   - `answer` → backend → peer.
   - `ice-candidate` → backend → peer.

### Join Success Conditions & Timeout Strategy (Frontend Fault-Tolerance)

- Primary success condition: receive `joinResponse(success=true)` (backend completed validation and socket↔room binding).
- Equivalent “success signals” (fault-tolerance; any one means “we’re effectively in” and should clear listeners/timers):
  - Initiator: receives `ready` or `recipient-ready`
  - Recipient: receives `offer`
- Timeout: 15 seconds. This covers weak networks, mobile, and Socket.IO polling fallback where joinResponse can arrive late.
- Why it’s safe: `ready/recipient-ready` are room broadcast events; `offer` is the P2P handshake starting point. If you can receive these, you’re in the room and negotiation has begun—treat it as success to avoid false “Join room timeout” errors.

Reconnect mechanics (mobile network switching support):

- **Dual disconnect detection**: Socket.IO `disconnect` → set `isSocketDisconnected = true`; P2P disconnect → set `isPeerDisconnected = true` and call `cleanupExistingConnection()`
- **Reconnect trigger**: only when both socket and P2P are disconnected → `attemptReconnection()`, guarded by `reconnectionInProgress` to avoid concurrent reconnects
- **State restoration**: reconnect calls `joinRoom(roomId, isInitiator, sendInitiatorOnline)`; the initiator auto-sends `initiator-online` and the recipient replies `recipient-ready`
- **ICE candidate queue**: cache candidates in `iceCandidatesQueue` until ready, then flush; support re-queuing invalid candidates with connection-state validation
- **Wake lock**: request via WakeLockManager when connected; release on disconnect to stabilize mobile transfers
- **Graceful disconnect tracking**: `gracefullyDisconnectedPeers` tracks intentionally closed peers; send retries skip them
- **DataChannel send retries**: up to 5 attempts with backoff from 100ms to 1000ms; skip peers marked as gracefully disconnected

**Backend signaling & room management**:

Socket.IO event handling flow:

1. **join**: IP rate limit → validate room existence → bind socket-room → success response → broadcast `ready`
2. **Reconnect state sync**: initiator reconnect sends `initiator-online`; recipient replies `recipient-ready`
3. **Relay signaling**: offer/answer/ice-candidate are forwarded with `socket.to(peerId).emit()`, including a `from` field
4. **Disconnect cleanup**: broadcast `peer-disconnected` → unbind socket-room → delete empty rooms after 15 minutes

**Room management**:

- Redis structures:
  - `room:<roomId>` (Hash): room creation time
  - `room:<roomId>:sockets` (Set): sockets in the room
  - `socket:<socketId>` (String): the roomId for a socket
- ID generation: prefer 4-digit numeric IDs; fall back to 4-character alphanumeric on collision
- Idempotency: long IDs (≥8 chars) can be reused across reconnects
- TTL: 24 hours, refreshed on activity

**Rate limiting**:

- Redis Sorted Set based IP rate limit
- Up to 2 requests per 5-second window
- Uses pipeline to keep operations atomic

Entry points:

- Frontend: `frontend/hooks/useWebRTCConnection.ts`, `frontend/lib/webrtc_base.ts`, `frontend/lib/webrtc_Initiator.ts`, `frontend/lib/webrtc_Recipient.ts`
- Backend: `backend/src/socket/handlers.ts` (all signaling events), `backend/src/services/room.ts`, `backend/src/routes/api.ts`

## 4) DataChannel Messages & Constraints (Overview)

- Messages (example names): `fileMetadata`, `fileRequest`, `chunk`, `fileReceiveComplete`, `folderRequest`, `folderReceiveComplete`, plus potential flow-control/keepalive messages.
- Core fields: file/folder id, indices/ranges, sizes, names, optional checksums.
- Key constraints:
  - Chunk size: choose a safe range per browser/network; mind channel buffer thresholds.
  - Backpressure: check `RTCDataChannel.bufferedAmount` and throttle as needed.
  - Completion: mark 100% only after `fileReceiveComplete` / `folderReceiveComplete`.
  - Resume: `fileRequest` can carry offset/range to support partial transfers.

## 5) Debugging Notes (Distilled from Experience)

- Download races / double counting: treat `frontend/stores/fileTransferStore.ts` as the single source of truth; provide cleanup APIs at the store level (e.g. `clearSendProgress`, `clearReceiveProgress`) rather than deleting objects locally in components.
- Recipient reconnect & room state: reset state correctly; UI must strictly derive from the store; leaving/rejoining should clear related state; follow `initiator-online`/`recipient-ready` ordering before starting an offer; verify room membership after reconnect.
- Reconnect with cached roomId: if `roomId` is cached, ensure renegotiation is triggered via online state sync (`initiator-online`/`recipient-ready`); backend must correctly clean and restore socket↔room mappings on disconnect/reconnect.
- Multiple transfers: don’t over-dedupe and mask real “second downloads”; rely on correct state cleanup.
- Dataflow principle: one-way dataflow (Store → Hooks → Components); hooks adapt, components consume but do not mutate shared state.
- **Practical debugging tactics**:
  - Add structured logs for connection state changes and store updates; for timing/race issues, `setTimeout(..., 0)` can help reorder updates
  - DataChannel send retries: `sendToPeer()` supports 5 retries with backoff from 100ms→1000ms; skip gracefully disconnected peers
  - WebRTC payload compatibility: handle `ArrayBuffer`/`Blob`/`Uint8Array`/`TypedArray` to cover Firefox quirks
  - Connection state monitoring: react to `connectionState` changes (connected/disconnected/failed/closed)
  - Backpressure control: DataChannel uses `bufferedAmountLowThreshold = 256KB`; check `bufferedAmount` before sending
  - Join false positives: if “Join room timeout” appears but you immediately see `offer/answer/connected` logs, it’s often a late joinResponse rather than a real failure; the 15s window plus “equivalent success signals” corrects it automatically

## 6) Frontend Component System & Core-Orchestrator Collaboration

This section is split into: [`docs/ai-playbook/flows/frontend.md`](./flows/frontend.md)

- Use it for: understanding boundaries and collaboration among UI components, hooks, and the store
- Includes: ClipboardApp orchestrator, hook layering, connection feedback state machine, dataflow patterns, etc.

## 7) Backpressure & Chunking Strategy (Deep Dive)

This section is split into: [`docs/ai-playbook/flows/backpressure-chunking.md`](./flows/backpressure-chunking.md)

- Use it for: verifying thresholds, chunk/batch strategy, embedded packet format, and performance tuning points
- Includes: sender dual-buffering, receiver storage strategy, debugging/monitoring tips, etc.

## 9) Resume / Partial Transfer (Deep Dive)

This section is split into: [`docs/ai-playbook/flows/resume.md`](./flows/resume.md)

- Use it for: verifying resume detection, offset negotiation, and chunk-range calculations
- Includes: ChunkRangeCalculator, sender/receiver resume flows, limitations, and debugging notes

## 10) Reconnect & State Consistency (Deep Dive)

This section is split into: [`docs/ai-playbook/flows/reconnect-consistency.md`](./flows/reconnect-consistency.md)

- Use it for: verifying dual disconnect rules, ICE candidate queues, send retries, and consistency safeguards
- Includes: reconnect triggers, retry strategy, mobile-specific additions, debugging notes

## 11) Micro-Plan Template (for Aligning on Small Changes)

Title: <short summary>

Background / Problem

- What user scenario or defect are we fixing?

Goals & Non-Goals

- What’s in scope, and what’s explicitly out of scope?

Impacted Files & Messages

- Code: list key files (e.g. `frontend/lib/webrtc_base.ts`, `backend/src/socket/handlers.ts`).
- Protocol: list DataChannel messages/fields to be changed.

State Machine / Flow Changes

- Add/remove/modify phases; include a short sequence diagram or steps.

Tests & Regression Checklist

- Unit/integration (if applicable), manual scenarios, performance/boundaries, reconnect cases.

Docs to Update

- `code-map.md` (if new entry points appear)
- `flows.md` (if flows/messages/constraints change)
- Other architecture or deployment docs (if involved)

