//接收文件(夹)的流程：先批量接收文件 meta 信息，【判断是否需要让用户选择保存目录】，然后点击请求，再接收文件内容，接收到endMeta之后，发送ack，结束
//发送文件夹的流程（同上）：接收批量文件请求
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
  FileEnd,
  FileHandlers,
  FileMeta,
} from "@/types/webrtc";

/**
 * Manages the state of an active file reception.
 */
interface ActiveFileReception {
  meta: fileMetadata; //有meta信息--表示当前正在接收该文件，为null--当前没有接收文件
  chunks: (ArrayBuffer | null)[]; //接收的（存放内存的）文件块
  receivedSize: number;
  fileHandle: FileSystemFileHandle | null; //写入磁盘相关对象--当前文件
  writeStream: FileSystemWritableFileStream | null; //写入磁盘相关对象
  completionNotifier: {
    resolve: () => void;
    reject: (reason?: any) => void;
  };
}

class FileReceiver {
  // region Private Properties
  private readonly webrtcConnection: WebRTC_Recipient;
  private readonly largeFileThreshold: number = 1 * 1024 * 1024 * 1024; // 1 GB,如果大于这个阈值，则需要用户选择保存目录直接储存在磁盘
  private readonly speedCalculator: SpeedCalculator;
  private fileHandlers: FileHandlers;

  private peerId: string = "";
  private saveDirectory: FileSystemDirectoryHandle | null = null;

  // State Management
  private pendingFilesMeta = new Map<string, fileMetadata>(); // 存储文件元信息,fileId:meta
  private folderProgresses: Record<string, FolderProgress> = {}; // 文件夹 进度信息, fileId:{totalSize:0,receivedSize:0,fileIds:[]};
  public saveType: Record<string, boolean> = {}; // fileId or folderName -> isSavedToDisk

  // Active transfer state
  private activeFileReception: ActiveFileReception | null = null;
  private activeStringReception: CurrentString | null = null;
  private currentFolderName: string | null = null; //有name--表示当前正在接收文件夹，为null--当前没有接收文件夹

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
      fileEnd: this.handleFileEnd.bind(this),
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
    if (this.saveType[fileId]) {
      this.log("log", "File already received, skipping request.", { fileId });
      return;
    }
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

    const receptionPromise = new Promise<void>((resolve, reject) => {
      this.activeFileReception = {
        meta: fileInfo,
        chunks: [],
        receivedSize: 0,
        fileHandle: null,
        writeStream: null,
        completionNotifier: { resolve, reject },
      };
    });

    const shouldSaveToDisk =
      !!this.saveDirectory ||
      fileInfo.size >= this.largeFileThreshold ||
      !!this.currentFolderName;

    if (shouldSaveToDisk) {
      await this.createDiskWriteStream(fileInfo);
    }

    const request = JSON.stringify({ type: "fileRequest", fileId });
    if (this.peerId) {
      this.webrtcConnection.sendData(request, this.peerId);
      this.log("log", "Sent fileRequest", { fileId });
    }

    return receptionPromise;
  }

  /**
   * Requests all files belonging to a folder from the peer.
   */
  public async requestFolder(folderName: string): Promise<void> {
    if (this.saveType[folderName]) {
      this.log("log", "Folder already received, skipping request.", {
        folderName,
      });
      return;
    }

    const folderProgress = this.folderProgresses[folderName];
    if (folderProgress?.fileIds.length > 0) {
      this.log("log", "Requesting to receive folder", { folderName });
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
    } else {
      this.log("warn", "No files found for the requested folder.", {
        folderName,
      });
    }
  }
  // endregion

  // region WebRTC Data Handlers
  private async handleReceivedData(
    data: string | ArrayBuffer,
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
        }
      } catch (error) {
        this.fireError("Error parsing received JSON data", { error });
      }
    } else if (data instanceof ArrayBuffer) {
      if (!this.activeFileReception) {
        this.fireError(
          "Received a file chunk without an active file reception.",
          { peerId }
        );
        return;
      }
      this.updateProgress(data.byteLength);
      await this.handleFileChunk(data);
    }
  }

  private handleFileMetadata(metadata: fileMetadata): void {
    if (this.pendingFilesMeta.has(metadata.fileId)) return; //如果已经接收过，则忽略

    this.log("log", "Received file metadata", { metadata });
    this.pendingFilesMeta.set(metadata.fileId, metadata);
    this.onFileMetaReceived?.(metadata);
    //把属于folder的部分关于文件大小的记录下来，用于计算进度
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
        //防止重复计算
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

  private async handleFileEnd(metadata: FileEnd): Promise<void> {
    this.log("log", "File transmission ended", { metadata });
    const reception = this.activeFileReception;
    if (!reception || reception.meta.fileId !== metadata.fileId) {
      this.log("warn", "Received fileEnd for unexpected file", { metadata });
      return;
    }

    if (!this.currentFolderName) {
      this.progressCallback?.(reception.meta.fileId, 1, 0);
    }

    await this.finalizeFileReceive();
    this.sendFileAck(reception.meta.fileId);
    this.log("log", "Sent file-finish ack", { fileId: reception.meta.fileId });

    reception.completionNotifier.resolve();
    this.activeFileReception = null;
  }
  // endregion

  // region File and Folder Processing
  private async handleFileChunk(chunk: ArrayBuffer): Promise<void> {
    if (!this.activeFileReception) return;

    if (this.activeFileReception.writeStream) {
      await this.writeLargeFileChunk(chunk);
    } else {
      this.activeFileReception.chunks.push(chunk);
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

    if (this.currentFolderName) {
      const folderProgress = this.folderProgresses[this.currentFolderName];
      if (!folderProgress) return;
      folderProgress.receivedSize += byteLength;

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
      this.speedCalculator.updateSendSpeed(this.peerId, reception.receivedSize);
      const speed = this.speedCalculator.getSendSpeed(this.peerId);
      const progress =
        reception.meta.size > 0
          ? reception.receivedSize / reception.meta.size
          : 0;
      this.progressCallback?.(reception.meta.fileId, progress, speed);
    }
  }
  // endregion

  // region Disk Operations
  private async createDiskWriteStream(meta: FileMeta): Promise<void> {
    if (!this.saveDirectory || !this.activeFileReception) {
      this.log("warn", "Save directory not set, falling back to in-memory.");
      return;
    }

    try {
      const folderHandle = await this.createFolderStructure(meta.fullName);
      const fileHandle = await folderHandle.getFileHandle(meta.name, {
        create: true,
      });
      const writeStream = await fileHandle.createWritable();

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

    // A CustomFile is a standard File object with added properties.
    // This is a common pattern for attaching extra metadata.
    const file = await reception.fileHandle.getFile();
    const customFile = Object.assign(file, {
      fullName: reception.meta.fullName,
      folderName: this.currentFolderName,
    }) as CustomFile;

    this.saveType[reception.meta.fileId] = true;
    if (this.currentFolderName) {
      this.saveType[this.currentFolderName] = true;
      // For files in a folder saved to disk, we don't call onFileReceived
      // as the user experience is typically to "open folder" after download.
    } else {
      await this.onFileReceived?.(customFile);
    }
  }
  // endregion

  // region In-Memory Operations
  private async finalizeMemoryFileReceive(): Promise<void> {
    const reception = this.activeFileReception;
    if (!reception) return;

    const fileBlob = new Blob(reception.chunks as ArrayBuffer[], {
      type: reception.meta.fileType,
    });
    const file = new File([fileBlob], reception.meta.name, {
      type: reception.meta.fileType,
    });

    const customFile = Object.assign(file, {
      fullName: reception.meta.fullName,
      folderName: this.currentFolderName,
    }) as CustomFile;

    this.saveType[reception.meta.fileId] = false;
    if (this.currentFolderName) {
      this.saveType[this.currentFolderName] = false;
    }

    await this.onFileReceived?.(customFile);
  }
  // endregion

  // region Communication
  private sendFileAck(fileId: string): void {
    if (!this.peerId) return;
    const confirmation = JSON.stringify({ type: "fileAck", fileId });
    this.webrtcConnection.sendData(confirmation, this.peerId);
  }
  // endregion
}

export default FileReceiver;
