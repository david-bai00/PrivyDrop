# PrivyDrop AI Playbook — Backpressure & Chunking Strategy (Deep Dive)

← Back to flow index: [`docs/ai-playbook/flows.md`](../flows.md)

(This page is the English edition of content split out from `docs/ai-playbook/flows.zh-CN.md`, preserving the original section numbering and structure.)

## 7) Backpressure & Chunking Strategy (Deep Dive)

### Sender Dual-Layer Buffering Architecture

**Design rationale**:

- **File read layer**: 4MB chunks reduce FileReader calls; 8 chunks form a 32MB batch
- **Network layer**: 64KB pieces fit WebRTC DataChannel limits and avoid sendData failed errors
- **Performance**: efficient slicing inside each batch; a single FileReader.read() yields 512 network chunks

**Key parameters**:

```typescript
TransferConfig.FILE_CONFIG = {
  CHUNK_SIZE: 4194304, // 4MB - file read chunks
  BATCH_SIZE: 8, // 8 chunks = 32MB batch
  NETWORK_CHUNK_SIZE: 65536, // 64KB - safe WebRTC send size
};
```

**Backpressure control**:

- **DataChannel thresholds**: `bufferedAmountLowThreshold = 256KB` (Initiator) and `512KB` (NetworkTransmitter)
- **Max buffer**: `maxBuffer = 1MB`; wait until pressure releases when exceeded
- **Async waiting**: listens to `bufferedamountlow`, with a timeout safeguard (10 seconds)

**Embedded metadata packet format**:

```
[4-byte length][JSON metadata][payload bytes]
```

- Each network chunk includes: chunkIndex, totalChunks, fileOffset, fileId, isLastChunk
- Receiver can parse each packet independently without relying on extra shared state

### Receiver Smart Storage Strategy

**Storage decision logic**:

```typescript
ReceptionConfig.shouldSaveToDisk(fileSize, hasSaveDirectory);
```

- **In-memory**: file < 1GB and no save directory chosen
- **Disk**: file ≥ 1GB or the user selected a save directory
- **Buffer cap**: up to 100 chunks buffered (≈ 6.4MB)

**Chunk validation**:

- **Format compatibility**: ArrayBuffer/Blob/Uint8Array/TypedArray supported
- **Integrity checks**: validate fileId, chunkIndex, chunkSize consistency
- **Firefox quirks**: Blob size checks and conversion error handling

**Strict sequential disk writes**:

- **SequencedDiskWriter**: guarantees in-order writes; enables streaming for large files
- **Resume**: `getPartialFileSize()` checks existing partial files
- **Auto completion**: `checkAndAutoFinalize()` verifies completeness

### Performance Tuning Details

**Sender-side optimizations**:

- **Batch reads**: 32MB batches reduce I/O operations and improve large file read throughput
- **Network fit**: 64KB balances transfer efficiency with cross-browser compatibility
- **Backpressure response**: leverages native WebRTC backpressure to prevent drops

**Receiver-side optimizations**:

- **Unified format conversion**: ChunkProcessor handles multiple payload formats in one place
- **Progress throttling**: 100ms for files, 200ms for folders to avoid UI overload
- **Memory management**: small files assemble in memory; large files stream to disk

**Error handling**:

- **Send retries**: NetworkTransmitter returns boolean for upper-layer retry logic
- **Conversion tolerance**: when Blob conversion fails, return null instead of aborting the transfer
- **Timeout safeguards**: 30s completion timeout; 5s graceful close timeout

### Debugging & Monitoring

**Dev logs**:

- **Chunk tracking**: log details every 100 chunks and for the last chunk
- **Backpressure monitoring**: buffer size changes and wait-time stats
- **Performance metrics**: transfer speed, batch processing time, conversion cost

**Production optimizations**:

- **Conditional logging**: `ENABLE_CHUNK_LOGGING` and `ENABLE_PROGRESS_LOGGING`
- **Error reporting**: critical errors are sent to the backend via `postLogToBackend`
- **Performance sampling**: use `performance.now()` for precise timings

