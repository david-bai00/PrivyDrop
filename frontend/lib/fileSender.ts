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
  FileAck,
  FileRequest,
  FolderComplete,
} from "@/types/webrtc";

class FileSender {
  private webrtcConnection: WebRTC_Initiator;
  private peerStates: Map<string, PeerState>;
  private readonly chunkSize: number;
  private readonly maxBufferSize: number;
  private pendingFiles: Map<string, CustomFile>;
  private pendingFolerMeta: Record<string, FolderMeta>;
  private speedCalculator: SpeedCalculator;
  
  // 检测是否为移动设备
  private isMobileDevice(): boolean {
    if (typeof navigator !== 'undefined') {
      return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    return false;
  }
  
  // 简化的日志记录（仅用于错误和关键信息）
  private logInfo(message: string): void {
    const deviceType = this.isMobileDevice() ? 'Mobile' : 'Desktop';
    const logMsg = `[FileSender][${deviceType}] ${message}`;
    console.log(logMsg);
  }

  // 根据设备类型获取最佳块大小
  private getOptimalChunkSize(): number {
    if (this.isMobileDevice()) {
      // 移动端优化：256KB大块大小，减少FileReader调用频率
      return 262144; // 移动端256KB，针对移动设备FileReader性能特点优化
    }
    return 65536; // 桌面端64KB保持标准大小
  }

  // 根据设备类型获取最佳缓冲区大小
  private getOptimalBufferSize(): number {
    if (this.isMobileDevice()) {
      // 移动设备优化的缓冲区大小，平衡内存使用和性能
      return 5; // 移动端5个块的预读，适合移动设备内存特点
    }
    return 10; // 桌面设备使用更大的缓冲区
  }
  


  constructor(WebRTC_initiator: WebRTC_Initiator) {
    this.webrtcConnection = WebRTC_initiator;

    // Maintain independent sending states for each receiver
    this.peerStates = new Map(); // Map<peerId, PeerState>

    // 动态设置基于设备的优化参数
    this.chunkSize = this.getOptimalChunkSize();
    this.maxBufferSize = this.getOptimalBufferSize();
    this.pendingFiles = new Map(); // All files pending to be sent (by reference) {fileId: CustomFile}

    this.pendingFolerMeta = {}; // Metadata for folders (total size, total file count), used for tracking transfer progress

    // Create a SpeedCalculator instance
    this.speedCalculator = new SpeedCalculator();
    this.setupDataHandler();
    
    // 简化的初始化日志
    const isMobile = this.isMobileDevice();
    this.logInfo(`FileSender initialized - Device: ${isMobile ? 'Mobile' : 'Desktop'}, ChunkSize: ${Math.round(this.chunkSize / 1024)}KB`);
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
          fileId: (message as FileAck).fileId,
        });
        break;
      case "folderComplete":
        const folderName = (message as FolderComplete).folderName;
        this.log(
          "log",
          `Received folderComplete message for ${folderName} from peer ${peerId}`
        );
        // The receiver has confirmed the folder is complete.
        // Force the progress to 100% for the sender's UI.
        if (this.pendingFolerMeta[folderName]) {
          peerState.progressCallback?.(folderName, 1, 0);
        }
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
    const offset = request.offset || 0;
    this.log(
      "log",
      `Handling file request for ${request.fileId} from ${peerId} with offset ${offset}`
    );
    if (file) {
      await this.sendSingleFile(file, peerId, offset);
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
        const metaDataString = JSON.stringify(fileMeta);

        const sendResult = this.webrtcConnection.sendData(metaDataString, pId);
        if (!sendResult) {
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
    peerId: string,
    offset: number = 0
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.getPeerState(peerId);

    if (peerState.isSending) {
      this.logInfo(`Already sending a file to peer ${peerId}, request for ${file.name} ignored.`);
      return;
    }

    this.logInfo(`Starting file transfer: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100}MB)`);

    // Reset state for the new transfer
    peerState.isSending = true;
    peerState.currentFolderName = file.folderName;
    peerState.readOffset = offset; // Start reading from the given offset
    peerState.bufferQueue = [];
    peerState.isReading = false;
    peerState.totalBytesSent[fileId] = offset; // Start counting sent bytes from the offset

    try {
      await this.processSendQueue(file, peerId);
      this.finalizeSendFile(fileId, peerId);

      await this.waitForTransferComplete(peerId); // Wait for transfer completion -- receiver confirmation
      
      this.logInfo(`File ${fileId} sent successfully to ${peerId}`);
    } catch (error: any) {
      this.fireError(`Error sending file ${file.name}: ${error.message}`, { fileId, peerId });
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

    // Always update the individual file's progress first.
    if (!peerState.totalBytesSent[fileId]) {
      // This case should be handled by sendSingleFile's initialization
      peerState.totalBytesSent[fileId] = 0;
    }
    peerState.totalBytesSent[fileId] += byteLength;

    let progressFileId = fileId;
    let currentBytes = peerState.totalBytesSent[fileId];
    let totalSize = fileSize;

    // If the file is part of a folder, recalculate the folder's progress.
    if (peerState.currentFolderName) {
      const folderId = peerState.currentFolderName;
      const folderMeta = this.pendingFolerMeta[folderId];
      progressFileId = folderId;
      totalSize = folderMeta?.totalSize || 0;

      // Recalculate folder progress from the sum of its files' progresses.
      // This is more robust and correct for resumed transfers.
      let folderTotalSent = 0;
      if (folderMeta) {
        folderMeta.fileIds.forEach((fId) => {
          folderTotalSent += peerState.totalBytesSent[fId] || 0;
        });
      }
      currentBytes = folderTotalSent;
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

    const isMobile = this.isMobileDevice();
    // 优化的缓冲区阈值：移动设备1.5MB，桌面512KB
    const threshold = isMobile ? 1572864 : 524288;
    
    // 检查是否需要等待背压缓解
    if (dataChannel.bufferedAmount > threshold) {
      await new Promise<void>((resolve) => {
        const onBufferedAmountLow = () => {
          dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
          resolve();
        };
        dataChannel.addEventListener('bufferedamountlow', onBufferedAmountLow);
        
        // 设置超时以避免永久等待
        setTimeout(() => {
          dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
          resolve();
        }, isMobile ? 1000 : 3000);
      });
    }
    
    if (!this.webrtcConnection.sendData(data, peerId)) {
      throw new Error("sendData failed");
    }
  }

  
  // 移动设备使用简化版本读取单个块
  private readSingleChunk(
    fileReader: FileReader,
    file: CustomFile,
    offset: number,
    chunkSize: number
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const slice = file.slice(offset, offset + chunkSize);
      fileReader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(e.target.result);
        } else {
          reject(new Error("Failed to read blob as ArrayBuffer"));
        }
      };
      fileReader.onerror = () => reject(fileReader.error || new Error("Read error"));
      fileReader.readAsArrayBuffer(slice);
    });
  }
  
  // 批量读取多个文件块，提升移动设备I/O性能
  private async readMultipleChunks(
    fileReader: FileReader,
    file: CustomFile,
    startOffset: number,
    chunkSize: number,
    batchSize: number
  ): Promise<ArrayBuffer[]> {
    const chunks: ArrayBuffer[] = [];
    const remainingSize = file.size - startOffset;
    const actualBatchSize = Math.min(batchSize, Math.ceil(remainingSize / chunkSize));
    
    for (let i = 0; i < actualBatchSize; i++) {
      const offset = startOffset + (i * chunkSize);
      if (offset >= file.size) break;
      
      const currentChunkSize = Math.min(chunkSize, file.size - offset);
      const chunk = await this.readSingleChunk(fileReader, file, offset, currentChunkSize);
      chunks.push(chunk);
    }
    
    return chunks;
  }
  
  // 移动设备优化的进度更新方法
  private updateProgressForMobile(
    byteLength: number,
    fileId: string,
    fileSize: number,
    peerId: string
  ): void {
    const peerState = this.getPeerState(peerId);
    
    // 初始化如果需要
    if (!peerState.totalBytesSent[fileId]) {
      peerState.totalBytesSent[fileId] = 0;
    }
    peerState.totalBytesSent[fileId] += byteLength;
    
    // 确保SpeedCalculator正确更新
    this.speedCalculator.updateSendSpeed(peerId, peerState.totalBytesSent[fileId]);
    
    if (peerState.currentFolderName) {
      // 文件夹处理
      const folderId = peerState.currentFolderName;
      if (!peerState.totalBytesSent[folderId]) {
        peerState.totalBytesSent[folderId] = 0;
      }
      peerState.totalBytesSent[folderId] += byteLength;
      
      // 更新SpeedCalculator为文件夹的总字节数
      this.speedCalculator.updateSendSpeed(peerId, peerState.totalBytesSent[folderId]);
      
      const folderMeta = this.pendingFolerMeta[folderId];
      if (folderMeta) {
        const progress = peerState.totalBytesSent[folderId] / folderMeta.totalSize;
        const speed = this.speedCalculator.getSendSpeed(peerId);
        peerState.progressCallback?.(folderId, progress, speed);
      }
    } else {
      // 单文件处理
      const progress = peerState.totalBytesSent[fileId] / fileSize;
      const speed = this.speedCalculator.getSendSpeed(peerId);
      peerState.progressCallback?.(fileId, progress, speed);
    }
  }

  // 移动设备优化版本，使用批量读取+循环，大幅提升性能
  private async processSendQueueMobile(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.getPeerState(peerId);
    const fileReader = new FileReader();
    
    let offset = peerState.readOffset || 0;
    // 优化的批量大小：移动端12块，桌面端3块
    const batchSize = this.isMobileDevice() ? 12 : 3;
    
    this.logInfo(`Starting optimized transfer - ChunkSize: ${Math.round(this.chunkSize / 1024)}KB, BatchSize: ${batchSize}`);

    try {
      // 使用批量读取+循环替代单块递归，大幅提升性能
      while (offset < file.size && peerState.isSending) {
        // 批量读取多个块
        const chunks = await this.readMultipleChunks(fileReader, file, offset, this.chunkSize, batchSize);
        
        if (chunks.length === 0) break;
        
        // 批量发送所有读取的块
        for (const chunk of chunks) {
          if (!peerState.isSending || offset >= file.size) break;
          
          await this.sendWithBackpressure(chunk, peerId);
          
          // 更新进度
          offset += chunk.byteLength;
          peerState.readOffset = offset;
          
          // 更新文件和文件夹进度
          this.updateProgressForMobile(chunk.byteLength, fileId, file.size, peerId);
        }
      }
      
      // 文件发送完毕
      if (offset >= file.size && !peerState.currentFolderName) {
        peerState.progressCallback?.(fileId, 1, 0);
      }
      
      const finalSpeed = this.speedCalculator.getSendSpeed(peerId);
      this.logInfo(`Transfer completed - Speed: ${finalSpeed.toFixed(2)} KB/s`);
      
    } catch (error: any) {
      this.fireError(`Error in mobile batch transfer: ${error.message}`, { fileId, peerId, offset });
      throw error;
    }
  }
  
  // 重命名原始方法为桌面版本
  private async processSendQueueDesktop(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.getPeerState(peerId);
    const fileReader = new FileReader();

    // The file object itself is the full file. Slicing happens here.
    const fileToSend = file.slice(peerState.readOffset);
    let relativeOffset = 0;

    while (relativeOffset < fileToSend.size) {
      if (!peerState.isSending) {
        throw new Error("File sending was aborted.");
      }

      // Read chunks into buffer if not already reading and buffer is not full
      if (
        !peerState.isReading &&
        peerState.bufferQueue.length < this.maxBufferSize
      ) {
        peerState.isReading = true;
        const slice = fileToSend.slice(
          relativeOffset,
          relativeOffset + this.chunkSize
        );
        try {
          const chunk = await this.readChunkAsArrayBuffer(fileReader, slice);
          peerState.bufferQueue.push(chunk);
          relativeOffset += chunk.byteLength;
          peerState.readOffset += chunk.byteLength; // Also update the main offset
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
        await new Promise((resolve) => setTimeout(resolve, 1));
      } else if (relativeOffset < fileToSend.size) {
        // Buffer is empty, not reading, but not done, so trigger a read
        continue;
      }
    }
    // Final progress update to 100%
    if (!peerState.currentFolderName) {
      this.getPeerState(peerId).progressCallback?.(fileId, 1, 0);
    }
  }

  // 根据设备类型选择合适的处理方法
  private async processSendQueue(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    // 根据设备类型选择不同的处理逻辑
    if (this.isMobileDevice()) {
      this.logInfo("Using mobile optimized send queue");
      await this.processSendQueueMobile(file, peerId);
    } else {
      await this.processSendQueueDesktop(file, peerId);
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
