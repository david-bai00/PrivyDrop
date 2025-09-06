// 🚀 新流程 - 接收端主导的文件传输：
// 1. 接收文件元数据 (fileMetadata)
// 2. 用户点击下载，发送文件请求 (fileRequest)
// 3. 接收所有数据块，自动检测完整性
// 4. 完成Store同步后，主动发送完成确认 (fileReceiveComplete/folderReceiveComplete)
// 文件夹传输：重复单文件流程，最后发送文件夹完成确认
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

/**
 * 🚀 严格按序缓冲写入管理器 - 优化大文件磁盘I/O性能
 */
class SequencedDiskWriter {
  private writeQueue = new Map<number, ArrayBuffer>();
  private nextWriteIndex = 0;
  private readonly maxBufferSize = 100; // 最多缓冲100个chunk（约6.4MB）
  private readonly stream: FileSystemWritableFileStream;
  private totalWritten = 0;

  constructor(stream: FileSystemWritableFileStream, startIndex: number = 0) {
    this.stream = stream;
    this.nextWriteIndex = startIndex;
  }

  /**
   * 写入一个chunk，自动管理顺序和缓冲
   */
  async writeChunk(chunkIndex: number, chunk: ArrayBuffer): Promise<void> {
    // 1. 如果是期待的下一个chunk，立即写入
    if (chunkIndex === this.nextWriteIndex) {
      await this.flushSequentialChunks(chunk);
      return;
    }

    // 2. 如果是未来的chunk，缓冲起来
    if (chunkIndex > this.nextWriteIndex) {
      if (this.writeQueue.size < this.maxBufferSize) {
        this.writeQueue.set(chunkIndex, chunk);
        postLogToBackend(
          `[DEBUG] 📦 BUFFERED chunk #${chunkIndex} (waiting for #${this.nextWriteIndex}), queue: ${this.writeQueue.size}/${this.maxBufferSize}`
        );
      } else {
        // 缓冲区满，强制处理最早的chunk以释放空间
        await this.forceFlushOldest();
        this.writeQueue.set(chunkIndex, chunk);
        postLogToBackend(
          `[DEBUG] ⚠️ BUFFER_FULL, forced flush and buffered chunk #${chunkIndex}`
        );
      }
      return;
    }

    // 3. 如果是过期的chunk，记录警告但忽略（已写入）
    postLogToBackend(
      `[DEBUG] ⚠️ DUPLICATE chunk #${chunkIndex} ignored (already written #${this.nextWriteIndex})`
    );
  }

  /**
   * 写入当前chunk并尝试连续写入后续的chunk
   */
  private async flushSequentialChunks(firstChunk: ArrayBuffer): Promise<void> {
    // 写入当前chunk
    await this.stream.write(firstChunk);
    this.totalWritten += firstChunk.byteLength;

    postLogToBackend(
      `[DEBUG] ✓ DISK_WRITE chunk #${this.nextWriteIndex} - ${firstChunk.byteLength} bytes, total: ${this.totalWritten}`
    );

    this.nextWriteIndex++;

    // 尝试连续写入缓冲中的chunk
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
      postLogToBackend(
        `[DEBUG] 🔥 SEQUENTIAL_FLUSH ${flushCount} chunks, now at #${this.nextWriteIndex}, queue: ${this.writeQueue.size}`
      );
    }
  }

  /**
   * 强制刷新最早的chunk以释放缓冲区空间
   */
  private async forceFlushOldest(): Promise<void> {
    if (this.writeQueue.size === 0) return;

    const oldestIndex = Math.min(...Array.from(this.writeQueue.keys()));
    const chunk = this.writeQueue.get(oldestIndex)!;

    // 警告：非序写入
    postLogToBackend(
      `[DEBUG] ⚠️ FORCE_FLUSH out-of-order chunk #${oldestIndex} (expected #${this.nextWriteIndex})`
    );

    // 使用seek在正确位置写入（降级处理）
    const fileOffset = oldestIndex * 65536; // 假设每个chunk 64KB
    await this.stream.seek(fileOffset);
    await this.stream.write(chunk);
    this.writeQueue.delete(oldestIndex);

    // 恢复到当前位置
    const currentOffset = this.nextWriteIndex * 65536;
    await this.stream.seek(currentOffset);
  }

  /**
   * 获取缓冲区状态
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
   * 关闭并清理资源
   */
  async close(): Promise<void> {
    // 尝试刷新所有剩余的chunk
    const remainingIndexes = Array.from(this.writeQueue.keys()).sort(
      (a, b) => a - b
    );
    for (const chunkIndex of remainingIndexes) {
      const chunk = this.writeQueue.get(chunkIndex)!;
      const fileOffset = chunkIndex * 65536;
      await this.stream.seek(fileOffset);
      await this.stream.write(chunk);
      postLogToBackend(
        `[DEBUG] 💾 FINAL_FLUSH chunk #${chunkIndex} at cleanup`
      );
    }

    this.writeQueue.clear();
  }
}

/**
 * 🚀 新版本：管理按序列化融合数据包的文件接收状态
 */
interface ActiveFileReception {
  meta: fileMetadata; // If meta is present, it means this file is currently being received; null means no file is being received.
  chunks: (ArrayBuffer | null)[]; // 按序号排列的数据块数组
  receivedSize: number;
  initialOffset: number; // For resuming downloads
  fileHandle: FileSystemFileHandle | null; // Object related to writing to disk -- current file.
  writeStream: FileSystemWritableFileStream | null; // Object related to writing to disk.
  sequencedWriter: SequencedDiskWriter | null; // 🚀 新增：严格按序写入管理器
  completionNotifier: {
    resolve: () => void;
    reject: (reason?: any) => void;
  };
  // 🚀 新版本：简化的按序接收管理
  receivedChunksCount: number; // 实际接收到的chunk数量
  expectedChunksCount: number; // 预期的chunk数量
  chunkSequenceMap: Map<number, boolean>; // 跟踪哪些chunk已经接收（用于chunk序号）
  isFinalized?: boolean; // 防止重复finalize的标记
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
      // 🚀 在错误时也要清理SequencedWriter
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
      const expectedChunksCount = Math.ceil((fileInfo.size - offset) / 65536); // 计算预期chunk数量

      this.activeFileReception = {
        meta: fileInfo,
        chunks: new Array(expectedChunksCount).fill(null), // 🚀 初始化为按索引排列的空数组
        receivedSize: 0,
        initialOffset: offset,
        fileHandle: null,
        writeStream: null,
        sequencedWriter: null, // 🚀 新增：严格按序写入管理器
        completionNotifier: { resolve, reject },
        // 🚀 新版本：简化的按序接收管理
        receivedChunksCount: 0,
        expectedChunksCount: expectedChunksCount,
        chunkSequenceMap: new Map<number, boolean>(),
      };

      postLogToBackend(
        `[DEBUG] 🚀 FILE_INIT - ${fileInfo.name}, size: ${fileInfo.size}, chunks: ${expectedChunksCount}`
      );
    });

    if (shouldSaveToDisk) {
      await this.createDiskWriteStream(fileInfo, offset);
    }

    const request: FileRequest = { type: "fileRequest", fileId, offset };
    if (this.peerId) {
      this.webrtcConnection.sendData(JSON.stringify(request), this.peerId);
      this.log("log", "Sent fileRequest", { request });

      // 调试日志：记录发送完成
      postLogToBackend(`[DEBUG] 📤 FILE_REQUEST sent`);
    } else {
      postLogToBackend(
        `[Firefox Debug] ERROR: Cannot send fileRequest - no peerId available!`
      );
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

    // 🚀 新流程：发送文件夹接收完成确认
    // 收集所有成功完成的文件ID
    const completedFileIds = folderProgress.fileIds.filter((fileId) => {
      // 这里可以添加更复杂的验证逻辑，现在简单假设都成功了
      return true;
    });

    postLogToBackend(
      `[Firefox Debug] 📁 All files in folder completed - ${folderName}, files: ${completedFileIds.length}/${folderProgress.fileIds.length}`
    );

    // 发送文件夹完成消息
    this.sendFolderReceiveComplete(folderName, completedFileIds, true);
  }
  // endregion

  // region WebRTC Data Handlers

  /**
   * 将各种二进制数据格式转换为ArrayBuffer
   * 支持Firefox的Blob、Uint8Array等格式
   */
  private async convertToArrayBuffer(data: any): Promise<ArrayBuffer | null> {
    const originalType = Object.prototype.toString.call(data);

    if (data instanceof ArrayBuffer) {
      return data;
    } else if (data instanceof Blob) {
      try {
        const arrayBuffer = await data.arrayBuffer();
        if (data.size !== arrayBuffer.byteLength) {
          postLogToBackend(
            `[DEBUG] ⚠️ Blob size mismatch: ${data.size}→${arrayBuffer.byteLength}`
          );
        }
        return arrayBuffer;
      } catch (error) {
        postLogToBackend(`[DEBUG] ❌ Blob conversion failed: ${error}`);
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
        postLogToBackend(`[DEBUG] ❌ TypedArray conversion failed: ${error}`);
        return null;
      }
    } else {
      postLogToBackend(
        `[DEBUG] ❌ Unknown data type: ${Object.prototype.toString.call(data)}`
      );
      return null;
    }
  }

  /**
   * 🚀 新增：解析融合数据包
   * 格式: [4字节长度] + [JSON元数据] + [实际chunk数据]
   */
  private parseEmbeddedChunkPacket(arrayBuffer: ArrayBuffer): {
    chunkMeta: EmbeddedChunkMeta;
    chunkData: ArrayBuffer;
  } | null {
    try {
      // 1. 检查数据包最小长度
      if (arrayBuffer.byteLength < 4) {
        postLogToBackend(
          `[DEBUG] ❌ Invalid embedded packet - too small: ${arrayBuffer.byteLength}`
        );
        return null;
      }

      // 2. 读取元数据长度（4字节）
      const lengthView = new Uint32Array(arrayBuffer, 0, 1);
      const metaLength = lengthView[0];

      // 3. 验证数据包的完整性
      const expectedTotalLength = 4 + metaLength;
      if (arrayBuffer.byteLength < expectedTotalLength) {
        postLogToBackend(
          `[DEBUG] ❌ Incomplete embedded packet - expected: ${expectedTotalLength}, got: ${arrayBuffer.byteLength}`
        );
        return null;
      }

      // 4. 提取元数据部分
      const metaBytes = new Uint8Array(arrayBuffer, 4, metaLength);
      const metaJson = new TextDecoder().decode(metaBytes);
      const chunkMeta: EmbeddedChunkMeta = JSON.parse(metaJson);

      // 5. 提取实际chunk数据部分
      const chunkDataStart = 4 + metaLength;
      const chunkData = arrayBuffer.slice(chunkDataStart);

      // 6. 验证chunk数据大小
      if (chunkData.byteLength !== chunkMeta.chunkSize) {
        postLogToBackend(
          `[DEBUG] ⚠️ Chunk size mismatch - meta: ${chunkMeta.chunkSize}, actual: ${chunkData.byteLength}`
        );
      }

      postLogToBackend(
        `[DEBUG] 📦 PARSED embedded packet - chunkIndex: ${chunkMeta.chunkIndex}/${chunkMeta.totalChunks}, chunkSize: ${chunkData.byteLength}, isLast: ${chunkMeta.isLastChunk}`
      );

      return { chunkMeta, chunkData };
    } catch (error) {
      postLogToBackend(`[DEBUG] ❌ Failed to parse embedded packet: ${error}`);
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
      // 🚀 新版本：处理融合数据包 - 彻底解决Firefox乱序问题
      const arrayBuffer = await this.convertToArrayBuffer(data);

      if (arrayBuffer) {
        if (!this.activeFileReception) {
          postLogToBackend(
            `[Firefox Debug] ERROR: Received file chunk but no active file reception!`
          );
          this.fireError(
            "Received a file chunk without an active file reception.",
            { peerId }
          );
          return;
        }

        // 🚀 统一处理：所有数据都作为融合数据包处理
        await this.handleEmbeddedChunkPacket(arrayBuffer);
      } else {
        postLogToBackend(
          `[Firefox Debug] ERROR: Failed to convert binary data to ArrayBuffer`
        );
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

  // endregion

  // region File and Folder Processing

  /**
   * 🚀 新版本：处理融合数据包
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

    // 验证fileId匹配
    if (chunkMeta.fileId !== reception.meta.fileId) {
      postLogToBackend(
        `[DEBUG] ⚠️ FileId mismatch - expected: ${reception.meta.fileId}, got: ${chunkMeta.fileId}`
      );
      return;
    }

    // 更新预期 chunks 数量（可能与初始预估不同）
    if (chunkMeta.totalChunks !== reception.expectedChunksCount) {
      postLogToBackend(
        `[DEBUG] ⚠️ Chunk count adjustment - expected: ${reception.expectedChunksCount}, actual: ${chunkMeta.totalChunks}`
      );
      reception.expectedChunksCount = chunkMeta.totalChunks;
      // 调整chunks数组大小
      if (reception.chunks.length < chunkMeta.totalChunks) {
        const newChunks = new Array(chunkMeta.totalChunks).fill(null);
        reception.chunks.forEach((chunk, index) => {
          if (index < newChunks.length) newChunks[index] = chunk;
        });
        reception.chunks = newChunks;
      }
    }

    // 按序号存储chunk
    const chunkIndex = chunkMeta.chunkIndex;
    if (chunkIndex >= 0 && chunkIndex < reception.chunks.length) {
      reception.chunks[chunkIndex] = chunkData;
      reception.chunkSequenceMap.set(chunkIndex, true);
      reception.receivedChunksCount++;

      postLogToBackend(
        `[DEBUG] ✓ SEQUENCED chunk #${chunkIndex}/${chunkMeta.totalChunks} stored - size: ${chunkData.byteLength}, isLast: ${chunkMeta.isLastChunk}`
      );

      // 更新进度
      this.updateProgress(chunkData.byteLength);

      if (reception.sequencedWriter) {
        // 🚀 使用严格按序写入管理器
        await reception.sequencedWriter.writeChunk(chunkIndex, chunkData);
      } else {
        postLogToBackend(`[DEBUG] ❌ Error - no sequencedWriter available`);
      }
    } else {
      postLogToBackend(
        `[DEBUG] ❌ Invalid chunk index - ${chunkIndex}, expected 0-${
          reception.chunks.length - 1
        }`
      );
    }

    await this.checkAndAutoFinalize();
  }

  /**
   * 🚀 新版本：统一的自动完成检查 - 支持融合数据包和旧格式
   */
  private async checkAndAutoFinalize(): Promise<void> {
    if (!this.activeFileReception) return;

    const reception = this.activeFileReception;
    const receivedChunks = reception.receivedChunksCount;
    const expectedChunks = reception.expectedChunksCount;

    // 计算当前实际接收的总大小
    const currentTotalSize = reception.chunks.reduce((sum, chunk) => {
      return sum + (chunk instanceof ArrayBuffer ? chunk.byteLength : 0);
    }, 0);
    const expectedSize = reception.meta.size;

    // 🚀 统一完整性检查：按序接收模式
    let sequencedCount = 0;
    for (let i = 0; i < expectedChunks; i++) {
      if (reception.chunks[i] instanceof ArrayBuffer) {
        sequencedCount++;
      }
    }
    const isSequencedComplete = sequencedCount === expectedChunks;

    const sizeComplete = currentTotalSize >= expectedSize;
    const isDataComplete = isSequencedComplete && sizeComplete;

    // 更频繁的调试信息只在接近完成时显示
    if (
      receivedChunks % 10 === 0 ||
      receivedChunks >= expectedChunks - 5 ||
      isDataComplete
    ) {
      postLogToBackend(
        `[DEBUG] 🔄 SEQUENCED progress - received: ${sequencedCount}/${expectedChunks}, total: ${currentTotalSize}/${expectedSize}, complete: ${isDataComplete}`
      );
    }

    // 防止重复finalize
    if (reception.isFinalized) {
      return;
    }

    if (isDataComplete) {
      postLogToBackend(
        `[DEBUG] 🎯 TRIGGERING finalize - chunks: ${sequencedCount}/${expectedChunks}, size: ${currentTotalSize}/${expectedSize}`
      );

      reception.isFinalized = true;

      try {
        await this.finalizeFileReceive();

        if (reception.completionNotifier) {
          reception.completionNotifier.resolve();
        }
        this.activeFileReception = null;

        postLogToBackend(`[DEBUG] ✅ Auto-finalize SUCCESS`);
      } catch (error) {
        postLogToBackend(`[DEBUG] ❌ Auto-finalize ERROR: ${error}`);
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

      // 🚀 创建严格按序写入管理器
      const startChunkIndex = Math.floor(offset / 65536); // 计算起始块索引
      this.activeFileReception.sequencedWriter = new SequencedDiskWriter(
        writeStream,
        startChunkIndex
      );

      postLogToBackend(
        `[DEBUG] 📢 SEQUENCED_WRITER created - startIndex: ${startChunkIndex}, offset: ${offset}`
      );
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
      // 🚀 先关闭严格按序写入管理器（刷新所有缓冲）
      if (reception.sequencedWriter) {
        await reception.sequencedWriter.close();
        const status = reception.sequencedWriter.getBufferStatus();
        postLogToBackend(
          `[DEBUG] 💾 SEQUENCED_WRITER closed - totalWritten: ${status.totalWritten}, finalQueue: ${status.queueSize}`
        );
        reception.sequencedWriter = null;
      }

      // 然后关闭文件流
      await reception.writeStream.close();

      postLogToBackend(`[DEBUG] ✅ LARGE_FILE finalized successfully`);
    } catch (error) {
      this.fireError("Error finalizing large file", { error });
    }
  }
  // endregion

  // region In-Memory Operations
  private async finalizeMemoryFileReceive(): Promise<void> {
    const reception = this.activeFileReception;
    if (!reception) return;

    postLogToBackend(
      `[DEBUG] 🔍 FINALIZE START - fileName: ${reception.meta.name}, expectedSize: ${reception.meta.size}, chunksArray: ${reception.chunks.length}`
    );

    // 🚀 简化版：验证按序接收的数据
    let totalChunkSize = 0;
    let validChunks = 0;

    reception.chunks.forEach((chunk, index) => {
      if (chunk instanceof ArrayBuffer) {
        validChunks++;
        totalChunkSize += chunk.byteLength;
      }
    });

    postLogToBackend(
      `[DEBUG] 📊 SEQUENCED_SUMMARY - valid: ${validChunks}/${reception.chunks.length}, totalSize: ${totalChunkSize}, expected: ${reception.meta.size}`
    );

    // 最终验证
    const sizeDifference = reception.meta.size - totalChunkSize;
    if (sizeDifference !== 0) {
      postLogToBackend(
        `[DEBUG] ❌ SIZE_MISMATCH - missing: ${sizeDifference} bytes`
      );
    } else {
      postLogToBackend(`[DEBUG] ✅ SIZE_VERIFIED - ${totalChunkSize} bytes`);
    }

    // 创建文件
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

    postLogToBackend(
      `[DEBUG] 📄 FILE_CREATED - size: ${file.size}, expected: ${
        reception.meta.size
      }, match: ${file.size === reception.meta.size}`
    );

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

      postLogToBackend(`[DEBUG] ✅ STORE_UPDATED - ${reception.meta.name}`);
    }

    // 发送完成确认
    this.sendFileReceiveComplete(
      reception.meta.fileId,
      totalChunkSize,
      validChunks,
      storeUpdated
    );
  }
  // endregion

  // region Communication

  /**
   * 发送文件接收完成确认 - 新的接收端主导流程
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

    postLogToBackend(
      `[DEBUG] 📤 SENT fileReceiveComplete - size: ${receivedSize}, chunks: ${receivedChunks}, success: ${success}`
    );
  }

  /**
   * 发送文件夹接收完成确认
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

    postLogToBackend(
      `[Firefox Debug] 📤 Sent folderReceiveComplete - folderName: ${folderName}, completedFiles: ${completedFileIds.length}, allStoreUpdated: ${allStoreUpdated}, success: ${success}`
    );
  }
  // endregion

  public gracefulShutdown(): void {
    if (this.activeFileReception?.sequencedWriter) {
      this.log(
        "log",
        "Attempting to gracefully close sequenced writer on page unload."
      );
      // 🚀 先关闭严格按序写入管理器
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
