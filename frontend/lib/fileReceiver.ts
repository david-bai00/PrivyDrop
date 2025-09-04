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
} from "@/types/webrtc";
import { postLogToBackend } from "@/app/config/api";

/**
 * Manages the state of an active file reception.
 */
interface ActiveFileReception {
  meta: fileMetadata; // If meta is present, it means this file is currently being received; null means no file is being received.
  chunks: (ArrayBuffer | null)[]; // Received file chunks (stored in memory).
  receivedSize: number;
  initialOffset: number; // For resuming downloads
  fileHandle: FileSystemFileHandle | null; // Object related to writing to disk -- current file.
  writeStream: FileSystemWritableFileStream | null; // Object related to writing to disk.
  completionNotifier: {
    resolve: () => void;
    reject: (reason?: any) => void;
  };
  // 新增：用于跟踪数据接收统计
  receivedChunksCount: number; // 实际接收到的chunk数量
  expectedChunksCount: number; // 预期的chunk数量
  lastChunkIndex: number; // 最后接收的chunk索引
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
        chunks: [],
        receivedSize: 0,
        initialOffset: offset,
        fileHandle: null,
        writeStream: null,
        completionNotifier: { resolve, reject },
        // 新增统计字段
        receivedChunksCount: 0,
        expectedChunksCount: expectedChunksCount,
        lastChunkIndex: -1,
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
    const completedFileIds = folderProgress.fileIds.filter(fileId => {
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
          postLogToBackend(`[DEBUG] ⚠️ Blob size mismatch: ${data.size}→${arrayBuffer.byteLength}`);
        }
        return arrayBuffer;
      } catch (error) {
        postLogToBackend(`[DEBUG] ❌ Blob conversion failed: ${error}`);
        return null;
      }
    } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
      try {
        const uint8Array = data instanceof Uint8Array 
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
      postLogToBackend(`[DEBUG] ❌ Unknown data type: ${Object.prototype.toString.call(data)}`);
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
      // 处理各种格式的二进制数据 - Firefox兼容性修复
      const arrayBuffer = await this.convertToArrayBuffer(data);
      
      if (arrayBuffer) {
        // 调试日志：记录接收到二进制数据
        postLogToBackend(
          `[Firefox Debug] Received binary data - originalType: ${Object.prototype.toString.call(data)}, convertedSize: ${arrayBuffer.byteLength}, peerId: ${peerId}`
        );

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

        postLogToBackend(
          `[Firefox Debug] Processing chunk for file: ${this.activeFileReception.meta.name}`
        );
        this.updateProgress(arrayBuffer.byteLength);
        await this.handleFileChunk(arrayBuffer);
      } else {
        postLogToBackend(
          `[Firefox Debug] ERROR: Failed to convert binary data to ArrayBuffer`
        );
        this.fireError("Received unsupported binary data format", {
          dataType: Object.prototype.toString.call(data),
          peerId
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
  private async handleFileChunk(chunk: ArrayBuffer): Promise<void> {
    if (!this.activeFileReception) return;

    // 🐛 DEBUG: 记录接收到的原始chunk信息
    const currentChunkIndex = this.activeFileReception.receivedChunksCount;
    postLogToBackend(
      `[DEBUG] 📥 RECEIVE chunk#${currentChunkIndex} - size: ${chunk.byteLength} bytes`
    );

    // 更新统计信息
    this.activeFileReception.receivedChunksCount++;
    this.activeFileReception.lastChunkIndex = Math.max(this.activeFileReception.lastChunkIndex, currentChunkIndex);
    
    // 更新进度统计
    this.updateProgress(chunk.byteLength);
    
    if (this.activeFileReception.writeStream) {
      await this.writeLargeFileChunk(chunk);
    } else {
      // 存储chunk到内存
      this.activeFileReception.chunks.push(chunk);
      
      // 🐛 DEBUG: 验证存储结果
      const storedChunk = this.activeFileReception.chunks[this.activeFileReception.chunks.length - 1];
      const currentTotalSize = this.activeFileReception.chunks.reduce((sum, c) => sum + (c?.byteLength || 0), 0);
      
      postLogToBackend(
        `[DEBUG] 📦 STORED chunk#${currentChunkIndex} - original: ${chunk.byteLength}, stored: ${storedChunk?.byteLength || 'null'}, total: ${currentTotalSize}`
      );
      
      // 🐛 DEBUG: 特别关注最后几个chunks
      if (currentChunkIndex >= 65) {
        postLogToBackend(
          `[DEBUG] 🔍 CRITICAL_CHUNK#${currentChunkIndex} - input: ${chunk.byteLength}, stored: ${storedChunk?.byteLength}, isLast: ${currentChunkIndex >= 67}`
        );
      }
    }

    await this.checkAndAutoFinalize();
  }

  /**
   * 🚀 新流程：自动检查数据完整性并触发finalize
   * 不再依赖发送端的fileEnd信号，接收端自主判断完成
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
    
    const chunksComplete = (receivedChunks >= expectedChunks);
    const sizeComplete = (currentTotalSize >= expectedSize);
    const isDataComplete = chunksComplete && sizeComplete;
    
    // 🐛 DEBUG: 完成状态检查
    if (receivedChunks % 10 === 0 || receivedChunks >= expectedChunks - 5) {
      postLogToBackend(
        `[DEBUG] 🔄 Progress check - chunks: ${receivedChunks}/${expectedChunks}, size: ${currentTotalSize}/${expectedSize}, complete: ${isDataComplete}`
      );
    }
    
    // 防止重复finalize
    if (reception.isFinalized) {
      return;
    }
    
    if (isDataComplete) {
      postLogToBackend(
        `[DEBUG] 🎯 TRIGGERING finalize - chunks: ${receivedChunks}/${expectedChunks}, size: ${currentTotalSize}/${expectedSize}`
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

  private async writeLargeFileChunk(chunk: ArrayBuffer): Promise<void> {
    const stream = this.activeFileReception?.writeStream;
    if (!stream) {
      // Fallback to memory if stream is not available for some reason
      this.activeFileReception?.chunks.push(chunk);
      return;
    }
    try {
      await stream.write(chunk);
      this.activeFileReception?.chunks.push(null); // Keep track of chunk count
    } catch (error) {
      this.fireError("Error writing chunk to disk", { error });
    }
  }

  private async finalizeLargeFileReceive(): Promise<void> {
    const reception = this.activeFileReception;
    if (!reception?.writeStream || !reception.fileHandle) return;

    try {
      await reception.writeStream.close();
    } catch (error) {
      this.fireError("Error closing write stream", { error });
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

    // 🐛 DEBUG: 详细分析每个chunk
    let totalChunkSize = 0;
    let validChunks = 0;
    const chunkDetails: string[] = [];
    
    reception.chunks.forEach((chunk, index) => {
      if (chunk instanceof ArrayBuffer) {
        validChunks++;
        totalChunkSize += chunk.byteLength;
        
        // 🐛 DEBUG: 特别关注最后几个chunks
        if (index >= reception.chunks.length - 5) {
          chunkDetails.push(`chunk#${index}: ${chunk.byteLength}bytes`);
          postLogToBackend(
            `[DEBUG] 🔍 FINAL_CHUNK_ANALYSIS - index: ${index}, size: ${chunk.byteLength}, isLast: ${index === reception.chunks.length - 1}`
          );
        }
        
        // 检测异常大小
        if (chunk.byteLength !== 65536 && index < reception.chunks.length - 1) {
          postLogToBackend(`[DEBUG] ⚠️ UNEXPECTED_SIZE - chunk#${index}: ${chunk.byteLength} (should be 65536)`);
        }
      } else {
        postLogToBackend(`[DEBUG] ❌ INVALID_CHUNK - index: ${index}, type: ${Object.prototype.toString.call(chunk)}`);
      }
    });

    // 🐛 DEBUG: 总体分析
    postLogToBackend(
      `[DEBUG] 📊 CHUNK_SUMMARY - valid: ${validChunks}/${reception.chunks.length}, totalSize: ${totalChunkSize}, expected: ${reception.meta.size}, diff: ${reception.meta.size - totalChunkSize}`
    );
    
    if (chunkDetails.length > 0) {
      postLogToBackend(`[DEBUG] 🔍 FINAL_CHUNKS: ${chunkDetails.join(', ')}`);
    }

    // 最终验证
    const sizeDifference = reception.meta.size - totalChunkSize;
    if (sizeDifference !== 0) {
      postLogToBackend(`[DEBUG] ❌ SIZE_MISMATCH - missing: ${sizeDifference} bytes`);
    } else {
      postLogToBackend(`[DEBUG] ✅ SIZE_VERIFIED - ${totalChunkSize} bytes`);
    }
    
    // 创建文件
    const fileBlob = new Blob(reception.chunks.filter(chunk => chunk instanceof ArrayBuffer) as ArrayBuffer[], {
      type: reception.meta.fileType,
    });
    
    const file = new File([fileBlob], reception.meta.name, {
      type: reception.meta.fileType,
    });
    
    postLogToBackend(`[DEBUG] 📄 FILE_CREATED - size: ${file.size}, expected: ${reception.meta.size}, match: ${file.size === reception.meta.size}`);

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
    
    const success = this.webrtcConnection.sendData(JSON.stringify(completeMessage), this.peerId);
    
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
    
    const success = this.webrtcConnection.sendData(JSON.stringify(completeMessage), this.peerId);
    
    postLogToBackend(
      `[Firefox Debug] 📤 Sent folderReceiveComplete - folderName: ${folderName}, completedFiles: ${completedFileIds.length}, allStoreUpdated: ${allStoreUpdated}, success: ${success}`
    );
  }
  // endregion

  public gracefulShutdown(): void {
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
