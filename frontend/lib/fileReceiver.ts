// 🚀 New Process - Receiver-Dominated File Transfer:
// 1. Receive file metadata (fileMetadata)
// 2. User clicks download, send file request (fileRequest)
// 3. Receive all data chunks, automatically detect integrity
// 4. After completing Store synchronization, proactively send completion confirmation (fileReceiveComplete/folderReceiveComplete)
// Folder Transfer: Repeat single file process, finally send folder completion confirmation
import { SpeedCalculator } from "@/lib/speedCalculator";
import WebRTC_Recipient from "./webrtc_Recipient";
import {
  CustomFile,
  fileMetadata,
  WebRTCMessage,
  FolderProgress,
  CurrentString,
  StringMetadata,
  StringChunk,
  FileHandlers,
  FileMeta,
  FileRequest,
  FileReceiveComplete,
  FolderReceiveComplete,
  EmbeddedChunkMeta,
} from "@/types/webrtc";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NEXT_PUBLIC_development!;
/**
 * 🚀 Strict Sequential Buffering Writer - Optimizes large file disk I/O performance
 */
class SequencedDiskWriter {
  private writeQueue = new Map<number, ArrayBuffer>();
  private nextWriteIndex = 0;
  private readonly maxBufferSize = 100; // Buffer up to 100 chunks (approximately 6.4MB)
  private readonly stream: FileSystemWritableFileStream;
  private totalWritten = 0;

  constructor(stream: FileSystemWritableFileStream, startIndex: number = 0) {
    this.stream = stream;
    this.nextWriteIndex = startIndex;
  }

  /**\n   * Write a chunk, automatically managing order and buffering\n   */
  async writeChunk(chunkIndex: number, chunk: ArrayBuffer): Promise<void> {
    // 1. If it is the expected next chunk, write immediately
    if (chunkIndex === this.nextWriteIndex) {
      await this.flushSequentialChunks(chunk);
      return;
    }

    // 2. If it's a future chunk, buffer it
    if (chunkIndex > this.nextWriteIndex) {
      if (this.writeQueue.size < this.maxBufferSize) {
        this.writeQueue.set(chunkIndex, chunk);
        if (developmentEnv === "true") {
          postLogToBackend(
            `[DEBUG] 📦 BUFFERED chunk #${chunkIndex} (waiting for #${this.nextWriteIndex}), queue: ${this.writeQueue.size}/${this.maxBufferSize}`
          );
        }
      } else {
        // Buffer full, forcing processing of the earliest chunk to free up space
        await this.forceFlushOldest();
        this.writeQueue.set(chunkIndex, chunk);
        if (developmentEnv === "true") {
          postLogToBackend(
            `[DEBUG] ⚠️ BUFFER_FULL, forced flush and buffered chunk #${chunkIndex}`
          );
        }
      }
      return;
    }

    // 3. If the chunk is expired, log a warning but ignore (already written)
    if (developmentEnv === "true") {
      postLogToBackend(
        `[DEBUG] ⚠️ DUPLICATE chunk #${chunkIndex} ignored (already written #${this.nextWriteIndex})`
      );
    }
  }

  /**
   * Write current chunk and attempt to sequentially write subsequent chunks
   */
  private async flushSequentialChunks(firstChunk: ArrayBuffer): Promise<void> {
    // Write current chunk
    await this.stream.write(firstChunk);
    this.totalWritten += firstChunk.byteLength;

    if (developmentEnv === "true") {
      postLogToBackend(
        `[DEBUG] ✓ DISK_WRITE chunk #${this.nextWriteIndex} - ${firstChunk.byteLength} bytes, total: ${this.totalWritten}`
      );
    }

    this.nextWriteIndex++;

    // Try to sequentially write chunks from buffer
    let flushCount = 0;
    while (this.writeQueue.has(this.nextWriteIndex)) {
      const chunk = this.writeQueue.get(this.nextWriteIndex)!;
      await this.stream.write(chunk);
      this.totalWritten += chunk.byteLength;
      this.writeQueue.delete(this.nextWriteIndex);

      flushCount++;
      this.nextWriteIndex++;
    }

    if (flushCount > 0) {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] 🔥 SEQUENTIAL_FLUSH ${flushCount} chunks, now at #${this.nextWriteIndex}, queue: ${this.writeQueue.size}`
        );
      }
    }
  }

  /**
   * Force refresh the earliest chunk to release buffer space
   */
  private async forceFlushOldest(): Promise<void> {
    if (this.writeQueue.size === 0) return;

    const oldestIndex = Math.min(...Array.from(this.writeQueue.keys()));
    const chunk = this.writeQueue.get(oldestIndex)!;

    // Warning: Unordered write
    if (developmentEnv === "true") {
      postLogToBackend(
        `[DEBUG] ⚠️ FORCE_FLUSH out-of-order chunk #${oldestIndex} (expected #${this.nextWriteIndex})`
      );
    }

    // Use seek to write at the correct position (fallback handling)
    const fileOffset = oldestIndex * 65536; // Assume each chunk is 64KB
    await this.stream.seek(fileOffset);
    await this.stream.write(chunk);
    this.writeQueue.delete(oldestIndex);

    // Return to current position
    const currentOffset = this.nextWriteIndex * 65536;
    await this.stream.seek(currentOffset);
  }

  /**
   * Get buffer status
   */
  getBufferStatus(): {
    queueSize: number;
    nextIndex: number;
    totalWritten: number;
  } {
    return {
      queueSize: this.writeQueue.size,
      nextIndex: this.nextWriteIndex,
      totalWritten: this.totalWritten,
    };
  }

  /**
   * Close and clean up resources
   */
  async close(): Promise<void> {
    // Try to flush all remaining chunks
    const remainingIndexes = Array.from(this.writeQueue.keys()).sort(
      (a, b) => a - b
    );
    for (const chunkIndex of remainingIndexes) {
      const chunk = this.writeQueue.get(chunkIndex)!;
      const fileOffset = chunkIndex * 65536;
      await this.stream.seek(fileOffset);
      await this.stream.write(chunk);
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] 💾 FINAL_FLUSH chunk #${chunkIndex} at cleanup`
        );
      }
    }

    this.writeQueue.clear();
  }
}

/**\n * 🚀 New Version: Manage file reception state for serialized embedded packets\n */
interface ActiveFileReception {
  meta: fileMetadata; // If meta is present, it means this file is currently being received; null means no file is being received.
  chunks: (ArrayBuffer | null)[]; // Array of data chunks arranged by index
  receivedSize: number;
  initialOffset: number; // For resuming downloads
  fileHandle: FileSystemFileHandle | null; // Object related to writing to disk -- current file.
  writeStream: FileSystemWritableFileStream | null; // Object related to writing to disk.
  sequencedWriter: SequencedDiskWriter | null; // 🚀 Added: Strict sequential writing manager
  completionNotifier: {
    resolve: () => void;
    reject: (reason?: any) => void;
  };
  // 🚀 New Version: Simplified sequential reception management
  receivedChunksCount: number; // Actual number of chunks received
  expectedChunksCount: number; // Expected number of chunks
  chunkSequenceMap: Map<number, boolean>; // Track which chunks have been received (for chunk numbering)
  isFinalized?: boolean; // Flag to prevent duplicate finalize operations
}

class FileReceiver {
  // region Private Properties
  private readonly webrtcConnection: WebRTC_Recipient;
  private readonly largeFileThreshold: number = 1 * 1024 * 1024 * 1024; // 1 GB, larger files will prompt the user to select a directory for direct disk saving.
  private readonly speedCalculator: SpeedCalculator;
  private fileHandlers: FileHandlers;

  private peerId: string = "";
  private saveDirectory: FileSystemDirectoryHandle | null = null;

  // State Management
  private pendingFilesMeta = new Map<string, fileMetadata>(); // Stores file metadata, fileId: meta
  private folderProgresses: Record<string, FolderProgress> = {}; // Folder progress information, fileId: {totalSize: 0, receivedSize: 0, fileIds: []};
  public saveType: Record<string, boolean> = {}; // fileId or folderName -> isSavedToDisk

  // Active transfer state
  private activeFileReception: ActiveFileReception | null = null;
  private activeStringReception: CurrentString | null = null;
  private currentFolderName: string | null = null; // The name of the folder currently being received, or null if not receiving a folder.

  // Callbacks
  public onFileMetaReceived: ((meta: fileMetadata) => void) | null = null;
  public onStringReceived: ((str: string) => void) | null = null;
  public onFileReceived: ((file: CustomFile) => Promise<void>) | null = null;
  private progressCallback:
    | ((id: string, progress: number, speed: number) => void)
    | null = null;
  // endregion

  constructor(WebRTC_recipient: WebRTC_Recipient) {
    this.webrtcConnection = WebRTC_recipient;
    this.speedCalculator = new SpeedCalculator();

    this.fileHandlers = {
      string: this.handleReceivedStringChunk.bind(this),
      stringMetadata: this.handleStringMetadata.bind(this),
      fileMeta: this.handleFileMetadata.bind(this),
    };

    this.setupDataHandler();
  }

  // region Logging and Error Handling
  private log(
    level: "log" | "warn" | "error",
    message: string,
    context?: Record<string, any>
  ) {
    const prefix = `[FileReceiver]`;
    console[level](prefix, message, context || "");
  }

  private fireError(message: string, context?: Record<string, any>) {
    if (this.webrtcConnection.fireError) {
      // @ts-ignore
      this.webrtcConnection.fireError(message, {
        ...context,
        component: "FileReceiver",
      });
    } else {
      this.log("error", message, context);
    }

    if (this.activeFileReception) {
      // 🚀 Also clean up SequencedWriter on error
      if (this.activeFileReception.sequencedWriter) {
        this.activeFileReception.sequencedWriter.close().catch((err) => {
          this.log(
            "error",
            "Error closing sequenced writer during error cleanup",
            { err }
          );
        });
      }

      this.activeFileReception.completionNotifier.reject(new Error(message));
      this.activeFileReception = null;
    }
  }
  // endregion

  // region Setup and Public API
  private setupDataHandler(): void {
    this.webrtcConnection.onDataReceived = this.handleReceivedData.bind(this);
  }

  public setProgressCallback(
    callback: (fileId: string, progress: number, speed: number) => void
  ): void {
    this.progressCallback = callback;
  }

  public setSaveDirectory(directory: FileSystemDirectoryHandle): Promise<void> {
    this.saveDirectory = directory;
    return Promise.resolve();
  }

  /**
   * Requests a single file from the peer.
   */
  public async requestFile(fileId: string, singleFile = true): Promise<void> {
    if (this.activeFileReception) {
      this.log("warn", "Another file reception is already in progress.");
      return;
    }

    if (singleFile) this.currentFolderName = null;

    const fileInfo = this.pendingFilesMeta.get(fileId);
    if (!fileInfo) {
      this.fireError("File info not found for the requested fileId", {
        fileId,
      });
      return;
    }

    const shouldSaveToDisk =
      !!this.saveDirectory || fileInfo.size >= this.largeFileThreshold;

    // Set saveType at the beginning of the request to prevent race conditions in the UI
    this.saveType[fileInfo.fileId] = shouldSaveToDisk;
    if (this.currentFolderName) {
      this.saveType[this.currentFolderName] = shouldSaveToDisk;
    }

    let offset = 0;
    if (shouldSaveToDisk && this.saveDirectory) {
      try {
        const folderHandle = await this.createFolderStructure(
          fileInfo.fullName
        );
        const fileHandle = await folderHandle.getFileHandle(fileInfo.name, {
          create: false,
        });
        const file = await fileHandle.getFile();
        offset = file.size;

        if (offset === fileInfo.size) {
          this.log("log", "File already fully downloaded.", { fileId });
          // Optionally, trigger a "completed" state in the UI directly
          this.progressCallback?.(fileId, 1, 0);
          return; // Skip the request
        }
        this.log("log", `Resuming file from offset: ${offset}`, { fileId });
      } catch (e) {
        // File does not exist, starting from scratch
        this.log("log", "Partial file not found, starting from scratch.", {
          fileId,
        });
        offset = 0;
      }
    }

    const receptionPromise = new Promise<void>((resolve, reject) => {
      const expectedChunksCount = Math.ceil((fileInfo.size - offset) / 65536); // Calculate expected chunk count

      this.activeFileReception = {
        meta: fileInfo,
        chunks: new Array(expectedChunksCount).fill(null), // 🚀 Initialize as an empty array arranged by index
        receivedSize: 0,
        initialOffset: offset,
        fileHandle: null,
        writeStream: null,
        sequencedWriter: null, // 🚀 Added: Strict sequential writing manager
        completionNotifier: { resolve, reject },
        // 🚀 New Version: Simplified sequential reception management
        receivedChunksCount: 0,
        expectedChunksCount: expectedChunksCount,
        chunkSequenceMap: new Map<number, boolean>(),
      };
    });

    if (shouldSaveToDisk) {
      await this.createDiskWriteStream(fileInfo, offset);
    }

    const request: FileRequest = { type: "fileRequest", fileId, offset };
    if (this.peerId) {
      this.webrtcConnection.sendData(JSON.stringify(request), this.peerId);
      this.log("log", "Sent fileRequest", { request });
    } else {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ERROR: Cannot send fileRequest - no peerId available!`
        );
      }
    }

    return receptionPromise;
  }

  /**
   * Requests all files belonging to a folder from the peer.
   */
  public async requestFolder(folderName: string): Promise<void> {
    const folderProgress = this.folderProgresses[folderName];
    if (!folderProgress || folderProgress.fileIds.length === 0) {
      this.log("warn", "No files found for the requested folder.", {
        folderName,
      });
      return;
    }

    // Pre-calculate total size of already downloaded parts of the folder
    let initialFolderReceivedSize = 0;
    if (this.saveDirectory) {
      for (const fileId of folderProgress.fileIds) {
        const fileInfo = this.pendingFilesMeta.get(fileId);
        if (fileInfo) {
          try {
            const folderHandle = await this.createFolderStructure(
              fileInfo.fullName
            );
            const fileHandle = await folderHandle.getFileHandle(fileInfo.name, {
              create: false,
            });
            const file = await fileHandle.getFile();
            initialFolderReceivedSize += file.size;
          } catch (e) {
            // File doesn't exist, so its size is 0.
          }
        }
      }
    }
    folderProgress.receivedSize = initialFolderReceivedSize;
    this.log(
      "log",
      `Requesting to receive folder, initial received size: ${initialFolderReceivedSize}`,
      { folderName }
    );

    this.currentFolderName = folderName;
    for (const fileId of folderProgress.fileIds) {
      try {
        await this.requestFile(fileId, false);
      } catch (error) {
        this.fireError(
          `Failed to receive file ${fileId} in folder ${folderName}`,
          { error }
        );
        // Stop receiving other files in the folder on error
        break;
      }
    }
    this.currentFolderName = null;

    // 🚀 New Process: Send folder reception completion confirmation
    // Collect all successfully completed file IDs
    const completedFileIds = folderProgress.fileIds.filter((fileId) => {
      // More complex validation logic can be added here, now simply assume all succeeded
      return true;
    });

    if (developmentEnv === "true") {
      postLogToBackend(
        `[DEBUG] 📁 All files in folder completed - ${folderName}, files: ${completedFileIds.length}/${folderProgress.fileIds.length}`
      );
    }

    // Send folder completion message
    this.sendFolderReceiveComplete(folderName, completedFileIds, true);
  }
  // endregion

  // region WebRTC Data Handlers

  /**
   * Convert various binary data formats to ArrayBuffer
   * Supports Blob, Uint8Array, and other formats for Firefox
   */
  private async convertToArrayBuffer(data: any): Promise<ArrayBuffer | null> {
    const originalType = Object.prototype.toString.call(data);

    if (data instanceof ArrayBuffer) {
      return data;
    } else if (data instanceof Blob) {
      try {
        const arrayBuffer = await data.arrayBuffer();
        if (data.size !== arrayBuffer.byteLength) {
          if (developmentEnv === "true") {
            postLogToBackend(
              `[DEBUG] ⚠️ Blob size mismatch: ${data.size}→${arrayBuffer.byteLength}`
            );
          }
        }
        return arrayBuffer;
      } catch (error) {
        if (developmentEnv === "true") {
          postLogToBackend(`[DEBUG] ❌ Blob conversion failed: ${error}`);
        }
        return null;
      }
    } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
      try {
        const uint8Array =
          data instanceof Uint8Array
            ? data
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const newArrayBuffer = new ArrayBuffer(uint8Array.length);
        new Uint8Array(newArrayBuffer).set(uint8Array);
        return newArrayBuffer;
      } catch (error) {
        if (developmentEnv === "true") {
          postLogToBackend(`[DEBUG] ❌ TypedArray conversion failed: ${error}`);
        }
        return null;
      }
    } else {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ❌ Unknown data type: ${Object.prototype.toString.call(
            data
          )}`
        );
      }
      return null;
    }
  }

  /**
   * 🚀 Parsing fusion packets
   * Format: [4 bytes length] + [JSON metadata] + [actual chunk data]
   */
  private parseEmbeddedChunkPacket(arrayBuffer: ArrayBuffer): {
    chunkMeta: EmbeddedChunkMeta;
    chunkData: ArrayBuffer;
  } | null {
    try {
      // 1. Check minimum packet length
      if (arrayBuffer.byteLength < 4) {
        if (developmentEnv === "true") {
          postLogToBackend(
            `[DEBUG] ❌ Invalid embedded packet - too small: ${arrayBuffer.byteLength}`
          );
        }
        return null;
      }

      // 2. Read metadata length (4 bytes)
      const lengthView = new Uint32Array(arrayBuffer, 0, 1);
      const metaLength = lengthView[0];

      // 3. Verify packet integrity
      const expectedTotalLength = 4 + metaLength;
      if (arrayBuffer.byteLength < expectedTotalLength) {
        if (developmentEnv === "true") {
          postLogToBackend(
            `[DEBUG] ❌ Incomplete embedded packet - expected: ${expectedTotalLength}, got: ${arrayBuffer.byteLength}`
          );
        }
        return null;
      }

      // 4. Extract metadata section
      const metaBytes = new Uint8Array(arrayBuffer, 4, metaLength);
      const metaJson = new TextDecoder().decode(metaBytes);
      const chunkMeta: EmbeddedChunkMeta = JSON.parse(metaJson);

      // 5. Extract actual chunk data section
      const chunkDataStart = 4 + metaLength;
      const chunkData = arrayBuffer.slice(chunkDataStart);

      // 6. Verify chunk data size
      if (chunkData.byteLength !== chunkMeta.chunkSize) {
        if (developmentEnv === "true") {
          postLogToBackend(
            `[DEBUG] ⚠️ Chunk size mismatch - meta: ${chunkMeta.chunkSize}, actual: ${chunkData.byteLength}`
          );
        }
      }

      return { chunkMeta, chunkData };
    } catch (error) {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ❌ Failed to parse embedded packet: ${error}`
        );
      }
      return null;
    }
  }

  private async handleReceivedData(
    data: string | ArrayBuffer | any,
    peerId: string
  ): Promise<void> {
    this.peerId = peerId;

    if (typeof data === "string") {
      try {
        const parsedData = JSON.parse(data) as WebRTCMessage;

        const handler =
          this.fileHandlers[parsedData.type as keyof FileHandlers];
        if (handler) {
          await handler(parsedData, peerId);
        } else {
          console.warn(
            `[DEBUG] ⚠️ FileReceiver Handler not found: ${parsedData.type}`
          );
        }
      } catch (error) {
        this.fireError("Error parsing received JSON data", { error });
      }
    } else {
      // 🚀 New Version: Process embedded packets - Completely solve Firefox out-of-order issue
      const arrayBuffer = await this.convertToArrayBuffer(data);

      if (arrayBuffer) {
        if (!this.activeFileReception) {
          if (developmentEnv === "true") {
            postLogToBackend(
              `[DEBUG] ERROR: Received file chunk but no active file reception!`
            );
          }
          this.fireError(
            "Received a file chunk without an active file reception.",
            { peerId }
          );
          return;
        }

        // 🚀 Unified processing: All data is processed as embedded packets
        await this.handleEmbeddedChunkPacket(arrayBuffer);
      } else {
        if (developmentEnv === "true") {
          postLogToBackend(
            `[DEBUG] ERROR: Failed to convert binary data to ArrayBuffer`
          );
        }
        this.fireError("Received unsupported binary data format", {
          dataType: Object.prototype.toString.call(data),
          peerId,
        });
      }
    }
  }

  private handleFileMetadata(metadata: fileMetadata): void {
    if (this.pendingFilesMeta.has(metadata.fileId)) {
      return; // Ignore if already received.
    }

    this.pendingFilesMeta.set(metadata.fileId, metadata);

    if (this.onFileMetaReceived) {
      this.onFileMetaReceived(metadata);
    } else {
      console.error(
        `[DEBUG] ❌ FileReceiver onFileMetaReceived callback does not exist!`
      );
    }
    // Record the file size for folder progress calculation.
    if (metadata.folderName) {
      const folderId = metadata.folderName;
      if (!(folderId in this.folderProgresses)) {
        this.folderProgresses[folderId] = {
          totalSize: 0,
          receivedSize: 0,
          fileIds: [],
        };
      }
      const folderProgress = this.folderProgresses[folderId];
      if (!folderProgress.fileIds.includes(metadata.fileId)) {
        // Prevent duplicate calculation
        folderProgress.totalSize += metadata.size;
        folderProgress.fileIds.push(metadata.fileId);
      }
    }
  }

  private handleStringMetadata(metadata: StringMetadata): void {
    this.activeStringReception = {
      length: metadata.length,
      chunks: [],
      receivedChunks: 0,
    };
  }

  private handleReceivedStringChunk(data: StringChunk): void {
    if (!this.activeStringReception) return;

    this.activeStringReception.chunks[data.index] = data.chunk;
    this.activeStringReception.receivedChunks++;

    if (this.activeStringReception.receivedChunks === data.total) {
      const fullString = this.activeStringReception.chunks.join("");
      this.onStringReceived?.(fullString);
      this.activeStringReception = null;
    }
  }

  // region File and Folder Processing

  /**
   * 🚀 New Version: Process embedded packets
   */
  private async handleEmbeddedChunkPacket(
    arrayBuffer: ArrayBuffer
  ): Promise<void> {
    const parsed = this.parseEmbeddedChunkPacket(arrayBuffer);
    if (!parsed) {
      this.fireError("Failed to parse embedded chunk packet");
      return;
    }

    const { chunkMeta, chunkData } = parsed;
    const reception = this.activeFileReception!;

    // Verify fileId match
    if (chunkMeta.fileId !== reception.meta.fileId) {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ⚠️ FileId mismatch - expected: ${reception.meta.fileId}, got: ${chunkMeta.fileId}`
        );
      }
      return;
    }

    // Update expected chunks count (may differ from initial estimate)
    if (chunkMeta.totalChunks !== reception.expectedChunksCount) {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ⚠️ Chunk count adjustment - expected: ${reception.expectedChunksCount}, actual: ${chunkMeta.totalChunks}`
        );
      }
      reception.expectedChunksCount = chunkMeta.totalChunks;
      // Adjust chunks array size
      if (reception.chunks.length < chunkMeta.totalChunks) {
        const newChunks = new Array(chunkMeta.totalChunks).fill(null);
        reception.chunks.forEach((chunk, index) => {
          if (index < newChunks.length) newChunks[index] = chunk;
        });
        reception.chunks = newChunks;
      }
    }

    // Store chunk by index
    const chunkIndex = chunkMeta.chunkIndex;
    if (chunkIndex >= 0 && chunkIndex < reception.chunks.length) {
      reception.chunks[chunkIndex] = chunkData;
      reception.chunkSequenceMap.set(chunkIndex, true);
      reception.receivedChunksCount++;

      // Update progress
      this.updateProgress(chunkData.byteLength);

      if (reception.sequencedWriter) {
        // 🚀 Use strict sequential write management
        await reception.sequencedWriter.writeChunk(chunkIndex, chunkData);
      }
    } else {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ❌ Invalid chunk index - ${chunkIndex}, expected 0-${
            reception.chunks.length - 1
          }`
        );
      }
    }

    await this.checkAndAutoFinalize();
  }

  /**
   * 🚀 Unified auto-complete check
   */
  private async checkAndAutoFinalize(): Promise<void> {
    if (!this.activeFileReception) return;

    const reception = this.activeFileReception;
    const receivedChunks = reception.receivedChunksCount;
    const expectedChunks = reception.expectedChunksCount;

    // Calculate current actual total received size
    const currentTotalSize = reception.chunks.reduce((sum, chunk) => {
      return sum + (chunk instanceof ArrayBuffer ? chunk.byteLength : 0);
    }, 0);
    const expectedSize = reception.meta.size;

    // 🚀 Unified integrity check: sequential reception mode
    let sequencedCount = 0;
    for (let i = 0; i < expectedChunks; i++) {
      if (reception.chunks[i] instanceof ArrayBuffer) {
        sequencedCount++;
      }
    }
    const isSequencedComplete = sequencedCount === expectedChunks;

    const sizeComplete = currentTotalSize >= expectedSize;
    const isDataComplete = isSequencedComplete && sizeComplete;

    // Prevent duplicate finalize
    if (reception.isFinalized) {
      return;
    }

    if (isDataComplete) {
      reception.isFinalized = true;

      try {
        await this.finalizeFileReceive();

        if (reception.completionNotifier) {
          reception.completionNotifier.resolve();
        }
        this.activeFileReception = null;
      } catch (error) {
        if (developmentEnv === "true") {
          postLogToBackend(`[DEBUG] ❌ Auto-finalize ERROR: ${error}`);
        }
        if (reception.completionNotifier) {
          reception.completionNotifier.reject(error);
        }
        this.activeFileReception = null;
      }
    }
  }

  private async finalizeFileReceive(): Promise<void> {
    if (!this.activeFileReception) return;

    if (this.activeFileReception.writeStream) {
      await this.finalizeLargeFileReceive();
    } else {
      await this.finalizeMemoryFileReceive();
    }
  }

  private updateProgress(byteLength: number): void {
    if (!this.peerId || !this.activeFileReception) return;

    this.activeFileReception.receivedSize += byteLength;
    const reception = this.activeFileReception;
    const totalReceived = reception.initialOffset + reception.receivedSize;

    if (this.currentFolderName) {
      const folderProgress = this.folderProgresses[this.currentFolderName];
      if (!folderProgress) return;
      // This is tricky: folder progress needs to sum up individual file progresses.
      // For simplicity, we'll estimate based on total received for the active file.
      // A more accurate implementation would track offsets for all files in the folder.
      folderProgress.receivedSize += byteLength; // This is an approximation

      this.speedCalculator.updateSendSpeed(
        this.peerId,
        folderProgress.receivedSize
      );
      const speed = this.speedCalculator.getSendSpeed(this.peerId);
      const progress =
        folderProgress.totalSize > 0
          ? folderProgress.receivedSize / folderProgress.totalSize
          : 0;
      this.progressCallback?.(this.currentFolderName, progress, speed);
    } else {
      this.speedCalculator.updateSendSpeed(this.peerId, totalReceived);
      const speed = this.speedCalculator.getSendSpeed(this.peerId);
      const progress =
        reception.meta.size > 0 ? totalReceived / reception.meta.size : 0;
      this.progressCallback?.(reception.meta.fileId, progress, speed);
    }
  }
  // endregion

  // region Disk Operations
  private async createDiskWriteStream(
    meta: FileMeta,
    offset: number
  ): Promise<void> {
    if (!this.saveDirectory || !this.activeFileReception) {
      this.log("warn", "Save directory not set, falling back to in-memory.");
      return;
    }

    try {
      const folderHandle = await this.createFolderStructure(meta.fullName);
      const fileHandle = await folderHandle.getFileHandle(meta.name, {
        create: true,
      });
      // Use keepExistingData: true to append
      const writeStream = await fileHandle.createWritable({
        keepExistingData: true,
      });
      // Seek to the offset to start writing from there
      await writeStream.seek(offset);

      this.activeFileReception.fileHandle = fileHandle;
      this.activeFileReception.writeStream = writeStream;

      // 🚀 Create a strictly sequential write manager
      const startChunkIndex = Math.floor(offset / 65536); // Calculate starting chunk index
      this.activeFileReception.sequencedWriter = new SequencedDiskWriter(
        writeStream,
        startChunkIndex
      );

      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] 📢 SEQUENCED_WRITER created - startIndex: ${startChunkIndex}, offset: ${offset}`
        );
      }
    } catch (err) {
      this.fireError("Failed to create file on disk", {
        err,
        fileName: meta.name,
      });
    }
  }

  private async createFolderStructure(
    fullName: string
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.saveDirectory) {
      throw new Error("Save directory not set");
    }

    const parts = fullName.split("/");
    parts.pop(); // Remove filename

    let currentDir = this.saveDirectory;
    for (const part of parts) {
      if (part) {
        currentDir = await currentDir.getDirectoryHandle(part, {
          create: true,
        });
      }
    }
    return currentDir;
  }

  private async finalizeLargeFileReceive(): Promise<void> {
    const reception = this.activeFileReception;
    if (!reception?.writeStream || !reception.fileHandle) return;

    try {
      // 🚀 First close the strict sequential writing manager (flush all buffers)
      if (reception.sequencedWriter) {
        await reception.sequencedWriter.close();
        const status = reception.sequencedWriter.getBufferStatus();
        if (developmentEnv === "true") {
          postLogToBackend(
            `[DEBUG] 💾 SEQUENCED_WRITER closed - totalWritten: ${status.totalWritten}, finalQueue: ${status.queueSize}`
          );
        }
        reception.sequencedWriter = null;
      }

      // Then close the file stream
      await reception.writeStream.close();

      if (developmentEnv === "true") {
        postLogToBackend(`[DEBUG] ✅ LARGE_FILE finalized successfully`);
      }
    } catch (error) {
      this.fireError("Error finalizing large file", { error });
    }
  }
  // endregion

  // region In-Memory Operations
  private async finalizeMemoryFileReceive(): Promise<void> {
    const reception = this.activeFileReception;
    if (!reception) return;

    // 🚀 Simplified: Verify sequentially received data
    let totalChunkSize = 0;
    let validChunks = 0;

    reception.chunks.forEach((chunk, index) => {
      if (chunk instanceof ArrayBuffer) {
        validChunks++;
        totalChunkSize += chunk.byteLength;
      }
    });

    // Final verification
    const sizeDifference = reception.meta.size - totalChunkSize;
    if (sizeDifference !== 0) {
      if (developmentEnv === "true") {
        postLogToBackend(
          `[DEBUG] ❌ SIZE_MISMATCH - missing: ${sizeDifference} bytes`
        );
      }
    }

    // Create file
    const fileBlob = new Blob(
      reception.chunks.filter(
        (chunk) => chunk instanceof ArrayBuffer
      ) as ArrayBuffer[],
      {
        type: reception.meta.fileType,
      }
    );

    const file = new File([fileBlob], reception.meta.name, {
      type: reception.meta.fileType,
    });

    const customFile = Object.assign(file, {
      fullName: reception.meta.fullName,
      folderName: this.currentFolderName,
    }) as CustomFile;

    let storeUpdated = false;
    if (this.onFileReceived) {
      await this.onFileReceived(customFile);
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
      storeUpdated = true;
    }

    // Send completion confirmation
    this.sendFileReceiveComplete(
      reception.meta.fileId,
      totalChunkSize,
      validChunks,
      storeUpdated
    );
  }
  // region Communication

  /**
   * Send file reception completion confirmation - New receiver-dominated process
   */
  private sendFileReceiveComplete(
    fileId: string,
    receivedSize: number,
    receivedChunks: number,
    storeUpdated: boolean
  ): void {
    if (!this.peerId) return;

    const completeMessage: FileReceiveComplete = {
      type: "fileReceiveComplete",
      fileId,
      receivedSize,
      receivedChunks,
      storeUpdated,
    };

    const success = this.webrtcConnection.sendData(
      JSON.stringify(completeMessage),
      this.peerId
    );
  }

  /**
   * Send folder reception completion confirmation
   */
  private sendFolderReceiveComplete(
    folderName: string,
    completedFileIds: string[],
    allStoreUpdated: boolean
  ): void {
    if (!this.peerId) return;

    const completeMessage: FolderReceiveComplete = {
      type: "folderReceiveComplete",
      folderName,
      completedFileIds,
      allStoreUpdated,
    };

    const success = this.webrtcConnection.sendData(
      JSON.stringify(completeMessage),
      this.peerId
    );

    if (developmentEnv === "true") {
      postLogToBackend(
        `[DEBUG] 📤 Sent folderReceiveComplete - folderName: ${folderName}, completedFiles: ${completedFileIds.length}, allStoreUpdated: ${allStoreUpdated}, success: ${success}`
      );
    }
  }
  // endregion

  public gracefulShutdown(): void {
    if (this.activeFileReception?.sequencedWriter) {
      this.log(
        "log",
        "Attempting to gracefully close sequenced writer on page unload."
      );
      // 🚀 First close the strict sequential writing manager
      this.activeFileReception.sequencedWriter.close().catch((err) => {
        this.log(
          "error",
          "Error closing sequenced writer during graceful shutdown",
          {
            err,
          }
        );
      });
    }

    if (this.activeFileReception?.writeStream) {
      this.log(
        "log",
        "Attempting to gracefully close write stream on page unload."
      );
      // We don't await this, as beforeunload does not wait for promises.
      // This is a "best effort" attempt to flush the buffer to disk.
      this.activeFileReception.writeStream.close().catch((err) => {
        this.log("error", "Error closing stream during graceful shutdown", {
          err,
        });
      });
    }

    // 🔧 Clean up all internal states to ensure correct file metadata reception upon reconnection
    this.pendingFilesMeta.clear();
    this.folderProgresses = {};
    this.saveType = {};
    this.activeFileReception = null;
    this.activeStringReception = null;
    this.currentFolderName = null;
  }
}

export default FileReceiver;
