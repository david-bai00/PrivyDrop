// Flow for receiving file(s)/folder(s): First, receive file metadata in batch, [decide if the user needs to select a save directory],
// then click to request, receive the file content, and after receiving endMeta, send an ack to finish.
// Flow for receiving a folder (same as above): Receive a batch file request.
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
  FileRequest,
} from "@/types/webrtc";

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
      this.activeFileReception = {
        meta: fileInfo,
        chunks: [],
        receivedSize: 0,
        initialOffset: offset,
        fileHandle: null,
        writeStream: null,
        completionNotifier: { resolve, reject },
      };
    });

    if (shouldSaveToDisk) {
      await this.createDiskWriteStream(fileInfo, offset);
    }

    const request: FileRequest = { type: "fileRequest", fileId, offset };
    if (this.peerId) {
      this.webrtcConnection.sendData(JSON.stringify(request), this.peerId);
      this.log("log", "Sent fileRequest", { request });
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
    if (this.pendingFilesMeta.has(metadata.fileId)) return; // Ignore if already received.

    this.log("log", "Received file metadata", { metadata });
    this.pendingFilesMeta.set(metadata.fileId, metadata);
    this.onFileMetaReceived?.(metadata);
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

    // saveType is now set in requestFile.
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
      this.activeFileReception = null;
    }
  }
}

export default FileReceiver;
