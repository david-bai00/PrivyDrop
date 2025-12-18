# PrivyDrop AI Playbook — Resume / Partial Transfer (Deep Dive)

← Back to flow index: [`docs/ai-playbook/flows.md`](../flows.md)

(This page is the English edition of content split out from `docs/ai-playbook/flows.zh-CN.md`, preserving the original section numbering and structure.)

## 9) Resume / Partial Transfer (Deep Dive)

### Core Resume Mechanism

**Resume detection & state restoration**:

- **Sender init**: `StreamingFileReader constructor(file, startOffset)` supports starting from any offset
- **Receiver detection**: `StreamingFileWriter.getPartialFileSize()` checks partial files via the File System Access API
- **State sync**: the fileRequest message includes an offset parameter to tell the sender where to continue

**Chunk index calculation**:

```typescript
// unified chunk calculation logic
const startChunk = Math.floor(startOffset / chunkSize);
const expectedChunks = Math.ceil((fileSize - startOffset) / chunkSize);
```

### ChunkRangeCalculator (Single Source of Truth)

**Purpose**: ensure sender and receiver use the exact same chunk-range math

```typescript
getChunkRange(fileSize, startOffset, chunkSize) {
  const startChunk = Math.floor(startOffset / chunkSize);
  const endChunk = Math.floor((fileSize - 1) / chunkSize);
  return { startChunk, endChunk, totalChunks: endChunk - startChunk + 1 };
}
```

**Key methods**:

- `getRelativeChunkIndex()`: convert absolute index to relative index for receiver-side array mapping
- `isChunkIndexValid()`: validate that a chunk index is within the expected range
- `calculateExpectedChunks()`: compute expected chunk count, aligned with ReceptionConfig

### Receiver-Side Resume Flow

**Partial-file detection**:

1. **Prepare directories**: `createFolderStructure()` ensures the target directory exists
2. **Lookup file**: `getFileHandle(fileName, {create: false})` checks if a file already exists
3. **Get size**: `file.getFile()` returns the current size as the resume starting point

**Resume decision logic**:

```typescript
// FileReceiveOrchestrator.ts
const offset = await this.streamingFileWriter.getPartialFileSize(
  fileInfo.name,
  fileInfo.fullName
);
if (offset === fileInfo.size) {
  // file is already complete; skip transfer
  return;
}
if (offset > 0) {
  // partial file found; resume
  // send fileRequest with offset
}
```

### Sender-Side Resume Response

**Preparation**:

- **Reset reader**: `StreamingFileReader.reset(startOffset)` starts reading from the new offset
- **Batch alignment**: `currentBatchStartOffset` and `totalFileOffset` are updated in sync
- **Chunk indices**: `startChunkIndex` records the transfer start point for boundary checks

**Resume log**:

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

### Benefits & Limitations

**Benefits**:

- **Saves bandwidth**: avoids re-sending already received bytes
- **Faster recovery**: large transfers can resume quickly after interruption
- **Better UX**: transient network issues don’t reset progress to zero

**Limitations / caveats**:

- **File consistency**: assumes file content hasn’t changed; consider validating size/mtime before resuming
- **Save location requirement**: supported when the user chose a save directory via the File System Access API
- **Browser support**: File System Access API is mainly Chrome/Edge; other browsers fall back to in-memory storage

**Debug support**:

- **Verbose logs**: record resume offset, chunk range, and expected transfer volume in dev
- **Error handling**: if file access fails, fall back to a full transfer from the start
- **State tracking**: the store records resume state and actual received size

