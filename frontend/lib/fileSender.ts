// Flow for sending file(s)/folder(s): First, send file metadata, wait for the receiver's request, then send the file content.
// After the file is sent, send an endMeta, wait for the receiver's ack, and finish.
// Flow for sending a folder (same as above): Receive a batch file request.
// Loop through and send the metadata for all files, then record the file size information for the folder part to calculate progress.
// The receiving display end distinguishes between single files and folders.
import { generateFileId } from "@/lib/fileUtils";
import { SpeedCalculator } from "@/lib/speedCalculator";
import WebRTC_Initiator from "./webrtc_Initiator";
import {
  CustomFile,
  fileMetadata,
  WebRTCMessage,
  PeerState,
  FolderMeta,
  FileRequest,
} from "@/types/webrtc";

class FileSender {
  private webrtcConnection: WebRTC_Initiator;
  private peerStates: Map<string, PeerState>;
  private readonly chunkSize: number;
  private readonly maxBufferSize: number;
  private pendingFiles: Map<string, CustomFile>;
  private pendingFolerMeta: Record<string, FolderMeta>;
  private speedCalculator: SpeedCalculator;

  constructor(WebRTC_initiator: WebRTC_Initiator) {
    this.webrtcConnection = WebRTC_initiator;

    // Maintain independent sending states for each receiver
    this.peerStates = new Map(); // Map<peerId, PeerState>

    this.chunkSize = 65536; // 64 KB chunks
    this.maxBufferSize = 10; // Number of chunks to pre-read
    this.pendingFiles = new Map(); // All files pending to be sent (by reference) {fileId: CustomFile}

    this.pendingFolerMeta = {}; // Metadata for folders (total size, total file count), used for tracking transfer progress

    // Create a SpeedCalculator instance
    this.speedCalculator = new SpeedCalculator();
    this.setupDataHandler();
  }

  // region Logging and Error Handling
  private log(
    level: "log" | "warn" | "error",
    message: string,
    context?: Record<string, any>
  ) {
    const prefix = `[FileSender]`;
    console[level](prefix, message, context || "");
  }

  private fireError(message: string, context?: Record<string, any>) {
    this.webrtcConnection.fireError(message, {
      ...context,
      component: "FileSender",
    });
  }
  // endregion
  // Initialize state for a new receiver
  private getPeerState(peerId: string): PeerState {
    if (!this.peerStates.has(peerId)) {
      this.peerStates.set(peerId, {
        isSending: false, // Used to determine if a file is successfully sent. True before sending, false after receiving ack.
        bufferQueue: [], // Pre-read buffer to improve sending efficiency.
        readOffset: 0, // Read position, used by the sending function.
        isReading: false, // Whether reading is in progress, used by the sending function to avoid duplicate reads.

        currentFolderName: "", // If the current file belongs to a folder, assign the folder name here.
        totalBytesSent: {}, // Bytes sent for a file/folder, used for progress calculation; {fileId: 0}
        progressCallback: null, // Progress callback.
      });
    }
    return this.peerStates.get(peerId)!; // ! Non-Null Assertion Operator
  }

  private setupDataHandler(): void {
    this.webrtcConnection.onDataReceived = (data, peerId) => {
      if (typeof data === "string") {
        try {
          const parsedData = JSON.parse(data) as WebRTCMessage;
          this.handleSignalingMessage(parsedData, peerId);
        } catch (error) {
          this.fireError("Error parsing received JSON data", { error, peerId });
        }
      }
    };
  }

  private handleSignalingMessage(message: WebRTCMessage, peerId: string): void {
    const peerState = this.getPeerState(peerId);
    switch (message.type) {
      case "fileRequest":
        this.handleFileRequest(message as FileRequest, peerId);
        break;
      case "fileAck":
        peerState.isSending = false;
        this.log("log", `Received file-finish ack from peer ${peerId}`, {
          fileId: (message as any).fileId,
        });
        break;
      default:
        this.log("warn", `Unknown signaling message type received`, {
          type: message.type,
          peerId,
        });
    }
  }

  public setProgressCallback(
    callback: (fileId: string, progress: number, speed: number) => void,
    peerId: string
  ): void {
    this.getPeerState(peerId).progressCallback = callback;
  }
  // Respond to a file request by sending the file
  private async handleFileRequest(
    request: FileRequest,
    peerId: string
  ): Promise<void> {
    const file = this.pendingFiles.get(request.fileId);
    this.log(
      "log",
      `Handling file request for ${request.fileId} from ${peerId}`
    );
    if (file) {
      await this.sendSingleFile(file, peerId);
    } else {
      this.fireError(`File not found for request`, {
        fileId: request.fileId,
        peerId,
      });
    }
  }
  // Modify the sendString method to be asynchronous
  public async sendString(content: string, peerId: string): Promise<void> {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += this.chunkSize) {
      chunks.push(content.slice(i, i + this.chunkSize));
    }

    // First, send the metadata
    await this.sendWithBackpressure(
      JSON.stringify({
        type: "stringMetadata",
        length: content.length,
      }),
      peerId
    );

    // Send each chunk sequentially, using backpressure control
    for (let i = 0; i < chunks.length; i++) {
      const data = JSON.stringify({
        type: "string",
        chunk: chunks[i],
        index: i,
        total: chunks.length,
      });
      await this.sendWithBackpressure(data, peerId);
    }
  }

  public sendFileMeta(files: CustomFile[], peerId?: string): void {
    // Record the size of files belonging to a folder for progress calculation
    files.forEach((file) => {
      if (file.folderName) {
        const folderId = file.folderName;
        // folderName: {totalSize: 0, fileIds: []}
        if (!this.pendingFolerMeta[folderId]) {
          this.pendingFolerMeta[folderId] = { totalSize: 0, fileIds: [] };
        }
        const folderMeta = this.pendingFolerMeta[folderId];
        const fileId = generateFileId(file);
        if (!folderMeta.fileIds.includes(fileId)) {
          // If the file has not been added yet
          folderMeta.fileIds.push(fileId);
          folderMeta.totalSize += file.size;
        }
      }
    });
    // Loop through and send the metadata for all files
    const peers = peerId
      ? [peerId]
      : Array.from(this.webrtcConnection.peerConnections.keys());
    peers.forEach((pId) => {
      files.forEach((file) => {
        const fileId = generateFileId(file);
        this.pendingFiles.set(fileId, file);
        const fileMeta = this.getFileMeta(file);
        this.log("log", "Sending file metadata", { fileMeta, peerId: pId });
        if (!this.webrtcConnection.sendData(JSON.stringify(fileMeta), pId)) {
          this.fireError("Failed to send file metadata", {
            fileMeta,
            peerId: pId,
          });
        }
      });
    });
  }

  // Send a single file
  private async sendSingleFile(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.getPeerState(peerId);

    if (peerState.isSending) {
      this.log(
        "warn",
        `Already sending a file to peer ${peerId}, request for ${file.name} ignored.`
      );
      return;
    }

    this.log("log", `Starting to send single file: ${file.name} to ${peerId}`);

    // Reset state for the new transfer
    peerState.isSending = true;
    peerState.currentFolderName = file.folderName;
    peerState.readOffset = 0;
    peerState.bufferQueue = [];
    peerState.isReading = false;
    peerState.totalBytesSent[fileId] = 0;

    try {
      await this.processSendQueue(file, peerId);
      this.finalizeSendFile(fileId, peerId);

      await this.waitForTransferComplete(peerId); // Wait for transfer completion -- receiver confirmation
    } catch (error: any) {
      this.fireError(`Error sending file ${file.name}`, {
        error: error.message,
        fileId,
        peerId,
      });
      this.abortFileSend(fileId, peerId);
    }
  }

  private async waitForTransferComplete(peerId: string): Promise<void> {
    const peerState = this.getPeerState(peerId);
    while (peerState?.isSending) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  private getFileMeta(file: CustomFile): fileMetadata {
    const fileId = generateFileId(file);
    return {
      type: "fileMeta",
      fileId,
      name: file.name,
      size: file.size,
      fileType: file.type,
      fullName: file.fullName,
      folderName: file.folderName,
    };
  }

  private async updateProgress(
    byteLength: number,
    fileId: string,
    fileSize: number,
    peerId: string
  ): Promise<void> {
    const peerState = this.getPeerState(peerId);
    if (!peerState) return;

    let progressFileId = fileId;
    let currentBytes = peerState.totalBytesSent[fileId] || 0;
    let totalSize = fileSize;

    if (peerState.currentFolderName) {
      const folderId = peerState.currentFolderName;
      progressFileId = folderId;
      if (!peerState.totalBytesSent[folderId])
        peerState.totalBytesSent[folderId] = 0;
      peerState.totalBytesSent[folderId] += byteLength;
      currentBytes = peerState.totalBytesSent[folderId];
      totalSize = this.pendingFolerMeta[folderId]?.totalSize || 0;
    } else {
      peerState.totalBytesSent[fileId] += byteLength;
      currentBytes = peerState.totalBytesSent[fileId];
    }

    this.speedCalculator.updateSendSpeed(peerId, currentBytes);
    const speed = this.speedCalculator.getSendSpeed(peerId);
    const progress = totalSize > 0 ? currentBytes / totalSize : 0;

    peerState.progressCallback?.(progressFileId, progress, speed);
  }

  private async sendWithBackpressure(
    data: string | ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    if (!dataChannel) {
      throw new Error("Data channel not found");
    }

    if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
      await new Promise<void>((resolve) => {
        const listener = () => {
          dataChannel.removeEventListener("bufferedamountlow", listener);
          resolve();
        };
        dataChannel.addEventListener("bufferedamountlow", listener);
      });
    }

    if (!this.webrtcConnection.sendData(data, peerId)) {
      throw new Error("sendData failed");
    }
  }
  //start sending file content
  private async processSendQueue(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.getPeerState(peerId);
    const fileReader = new FileReader();

    while (peerState.readOffset < file.size) {
      if (!peerState.isSending) {
        throw new Error("File sending was aborted.");
      }

      // Read chunks into buffer if not already reading and buffer is not full
      if (
        !peerState.isReading &&
        peerState.bufferQueue.length < this.maxBufferSize
      ) {
        peerState.isReading = true;
        const slice = file.slice(
          peerState.readOffset,
          peerState.readOffset + this.chunkSize
        );
        try {
          const chunk = await this.readChunkAsArrayBuffer(fileReader, slice);
          peerState.bufferQueue.push(chunk);
          peerState.readOffset += chunk.byteLength;
        } catch (error: any) {
          throw new Error(`File chunk reading failed: ${error.message}`);
        } finally {
          peerState.isReading = false;
        }
      }

      // Send chunks from buffer
      if (peerState.bufferQueue.length > 0) {
        const chunk = peerState.bufferQueue.shift()!;
        await this.sendWithBackpressure(chunk, peerId);
        await this.updateProgress(chunk.byteLength, fileId, file.size, peerId);
      } else if (peerState.isReading) {
        // If buffer is empty but we are still reading, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else if (peerState.readOffset < file.size) {
        // Buffer is empty, not reading, but not done, so trigger a read
        continue;
      }
    }
    // Final progress update to 100%
    if (!peerState.currentFolderName) {
      this.getPeerState(peerId).progressCallback?.(fileId, 1, 0);
    }
  }

  private readChunkAsArrayBuffer(
    fileReader: FileReader,
    blob: Blob
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      fileReader.onload = (e) => {
        // Ensure e.target.result is an ArrayBuffer
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(e.target.result);
        } else {
          reject(new Error("Failed to read blob as ArrayBuffer"));
        }
      };
      fileReader.onerror = () =>
        reject(fileReader.error || new Error("Unknown FileReader error"));
      fileReader.onabort = () => reject(new Error("File reading was aborted"));
      fileReader.readAsArrayBuffer(blob);
    });
  }
  //send fileEnd signal
  private finalizeSendFile(fileId: string, peerId: string): void {
    // this.log("log", `Finalizing file send for ${fileId} to ${peerId}`);
    const endMessage = JSON.stringify({ type: "fileEnd", fileId });
    if (!this.webrtcConnection.sendData(endMessage, peerId)) {
      this.log("warn", `Failed to send fileEnd message for ${fileId}`);
    }
    // The isSending flag will be set to false upon receiving fileAck
  }

  private abortFileSend(fileId: string, peerId: string): void {
    this.log("warn", `Aborting file send for ${fileId} to ${peerId}`);
    const peerState = this.getPeerState(peerId);
    peerState.isSending = false;
    peerState.readOffset = 0;
    peerState.bufferQueue = [];
    peerState.isReading = false;
    // Optionally, send an abort message to the receiver
  }
}

export default FileSender;
