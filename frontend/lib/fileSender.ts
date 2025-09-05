// 🚀 新流程 - 接收端主导的文件传输：
// 1. 发送文件元数据 (fileMetadata)
// 2. 接收文件请求 (fileRequest)
// 3. 发送所有数据块，完成后等待接收端确认
// 4. 收到接收端确认 (fileReceiveComplete/folderReceiveComplete) 后设置进度100%
// 发送端不再主动发送完成信号，完全由接收端控制完成时机
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
  FileReceiveComplete,
  FolderReceiveComplete,
} from "@/types/webrtc";
import { postLogToBackend } from "@/app/config/api";

class FileSender {
  private webrtcConnection: WebRTC_Initiator;
  private peerStates: Map<string, PeerState>;
  private readonly chunkSize: number;
  private pendingFiles: Map<string, CustomFile>;
  private pendingFolerMeta: Record<string, FolderMeta>;
  private speedCalculator: SpeedCalculator;

  // Adaptive performance monitoring
  private networkPerformance: Map<
    string,
    {
      avgClearingRate: number; // Average network clearing speed KB/s
      optimalThreshold: number; // Dynamically optimized threshold
      avgWaitTime: number; // Average wait time
      sampleCount: number; // Sample count
    }
  > = new Map();

  // Hybrid optimization configuration - FileReader large chunks + network small packets strategy (fixes sendData failed)
  private static readonly OPTIMIZED_CONFIG = {
    CHUNK_SIZE: 4194304, // 4MB - Extreme large chunks, maximally reduce FileReader calls
    BATCH_SIZE: 8, // 8 chunks batch - 32MB batch processing success
    NETWORK_CHUNK_SIZE: 65536, // 64KB - WebRTC safe sending size, fixes sendData failed
    BUFFER_THRESHOLD: 3145728, // 3MB - Threshold
    BACKPRESSURE_TIMEOUT: 2000, // 2 second timeout - reserves more time for large chunk processing
  } as const;

  constructor(WebRTC_initiator: WebRTC_Initiator) {
    this.webrtcConnection = WebRTC_initiator;

    // Maintain independent sending states for each receiver
    this.peerStates = new Map(); // Map<peerId, PeerState>

    // Uniformly use optimized parameters - all devices share the best configuration
    this.chunkSize = FileSender.OPTIMIZED_CONFIG.CHUNK_SIZE;
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
    postLogToBackend(`debug Message:${message.type}`);
    switch (message.type) {
      case "fileRequest":
        this.handleFileRequest(message as FileRequest, peerId);
        break;
      case "fileReceiveComplete":
        this.handleFileReceiveComplete(message as FileReceiveComplete, peerId);
        break;
      case "folderReceiveComplete":
        this.handleFolderReceiveComplete(
          message as FolderReceiveComplete,
          peerId
        );
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

  /**
   * 处理接收端发送的文件接收完成确认 - 新流程
   */
  private handleFileReceiveComplete(
    message: FileReceiveComplete,
    peerId: string
  ): void {
    const peerState = this.getPeerState(peerId);

    postLogToBackend(
      `[Firefox Debug] 📥 Received fileReceiveComplete - fileId: ${message.fileId}, receivedSize: ${message.receivedSize}, receivedChunks: ${message.receivedChunks}, storeUpdated: ${message.storeUpdated}`
    );

    // 清理发送状态
    peerState.isSending = false;

    // 触发单文件100%进度（只有非文件夹情况）
    if (!peerState.currentFolderName) {
      postLogToBackend(
        `[Firefox Debug] 🎯 Setting single file progress to 100% - ${message.fileId}`
      );
      peerState.progressCallback?.(message.fileId, 1, 0);
    } else {
      postLogToBackend(
        `[Firefox Debug] 📁 File in folder completed, not setting progress yet - ${message.fileId} (folder: ${peerState.currentFolderName})`
      );
    }

    this.log("log", `File reception confirmed by peer ${peerId}`, {
      fileId: message.fileId,
      receivedSize: message.receivedSize,
      storeUpdated: message.storeUpdated,
    });
  }

  /**
   * 处理接收端发送的文件夹接收完成确认 - 新流程
   */
  private handleFolderReceiveComplete(
    message: FolderReceiveComplete,
    peerId: string
  ): void {
    const peerState = this.getPeerState(peerId);

    postLogToBackend(
      `[Firefox Debug] 📥 Received folderReceiveComplete - folderName: ${message.folderName}, completedFiles: ${message.completedFileIds.length}, allStoreUpdated: ${message.allStoreUpdated}`
    );

    // 触发文件夹100%进度
    if (this.pendingFolerMeta[message.folderName]) {
      postLogToBackend(
        `[Firefox Debug] 🎯 Setting folder progress to 100% - ${message.folderName}`
      );
      peerState.progressCallback?.(message.folderName, 1, 0);
    }

    this.log("log", `Folder reception confirmed by peer ${peerId}`, {
      folderName: message.folderName,
      completedFiles: message.completedFileIds.length,
      allStoreUpdated: message.allStoreUpdated,
    });
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

    // 🔧 Firefox兼容性修复：添加稍长延迟确保接收端完全准备好
    // 根据[[memory:7549586]]，这个延迟解决了时序竞态条件
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (file) {
      postLogToBackend(
        `[Firefox Debug] Starting file send - fileName: ${file.name}, fileSize: ${file.size}, offset: ${offset}`
      );
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
      return;
    }

    // Reset state for the new transfer
    peerState.isSending = true;
    peerState.currentFolderName = file.folderName;
    peerState.readOffset = offset; // Start reading from the given offset
    peerState.bufferQueue = [];
    peerState.isReading = false;
    peerState.totalBytesSent[fileId] = offset; // Start counting sent bytes from the offset

    try {
      await this.processSendQueue(file, peerId);

      // 🚀 新流程：不再主动发送fileEnd，等待接收端的fileReceiveComplete确认
      postLogToBackend(
        `[Firefox Debug] 📤 File sending completed, waiting for receiver confirmation - ${file.name}`
      );

      // 新流程：让接收端主导完成流程，不再主动发送fileEnd

      await this.waitForTransferComplete(peerId); // Wait for receiver's fileReceiveComplete confirmation
    } catch (error: any) {
      this.fireError(`Error sending file ${file.name}: ${error.message}`, {
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
    peerId: string,
    wasActuallySent: boolean = true // 新增：确保只有真正发送成功的数据才被统计
  ): Promise<void> {
    const peerState = this.getPeerState(peerId);
    if (!peerState) return;

    // 🔧 重要修复：只有成功发送的数据才更新统计
    if (!wasActuallySent) {
      postLogToBackend(
        `[Firefox Debug] ⚠️ Data send failed, not updating progress - fileId: ${fileId}, size: ${byteLength}`
      );
      return;
    }

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

    // Continuously update network performance (learn from transfer speed)
    this.updateNetworkFromSpeed(peerId);

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

    try {
      // For ArrayBuffer, if it exceeds 64KB, it needs to be sent in fragments (fixes sendData failed)
      if (data instanceof ArrayBuffer) {
        await this.sendLargeArrayBuffer(data, peerId);
      } else {
        await this.sendSingleData(data, peerId);
      }
    } catch (error) {
      // 确保所有发送失败都能被正确抛出
      const errorMessage = `sendWithBackpressure failed: ${error}`;
      postLogToBackend(`[Firefox Debug] ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  // New: Send large ArrayBuffer in fragments
  private async sendLargeArrayBuffer(
    data: ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const networkChunkSize = FileSender.OPTIMIZED_CONFIG.NETWORK_CHUNK_SIZE;
    const totalSize = data.byteLength;

    // If data is less than 64KB, send directly
    if (totalSize <= networkChunkSize) {
      await this.sendSingleData(data, peerId);
      return;
    }

    // Send large chunks in fragments
    let offset = 0;
    let fragmentIndex = 0;

    while (offset < totalSize) {
      const chunkSize = Math.min(networkChunkSize, totalSize - offset);
      const chunk = data.slice(offset, offset + chunkSize);

      // Send fragment
      await this.sendSingleData(chunk, peerId);
      postLogToBackend(
        `[sender Debug] chunk idx:${fragmentIndex} ,size:${chunkSize}`
      );
      offset += chunkSize;
      fragmentIndex++;
    }
  }

  // New: Send single data packet with active polling backpressure control
  private async sendSingleData(
    data: string | ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    if (!dataChannel) {
      throw new Error("Data channel not found");
    }

    // Firefox兼容性调试：记录发送前的数据信息
    const dataType =
      typeof data === "string"
        ? "string"
        : data instanceof ArrayBuffer
        ? "ArrayBuffer"
        : "unknown";
    const dataSize =
      typeof data === "string"
        ? data.length
        : data instanceof ArrayBuffer
        ? data.byteLength
        : 0;

    // Intelligent send control - decide sending strategy based on buffer status
    await this.smartBufferControl(dataChannel, peerId);

    // Send data
    const sendResult = this.webrtcConnection.sendData(data, peerId);

    if (!sendResult) {
      const errorMessage = `sendData failed for ${dataType} data of size ${dataSize}`;
      postLogToBackend(`[Firefox Debug] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  // Initialize network performance monitoring (called at the start of transfer)
  private initializeNetworkPerformance(peerId: string): void {
    if (!this.networkPerformance.has(peerId)) {
      // Use conservative initial values
      this.networkPerformance.set(peerId, {
        avgClearingRate: 5000, // 5MB/s initial estimate
        optimalThreshold: FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD,
        avgWaitTime: 50, // 50ms initial estimate
        sampleCount: 0,
      });
    }
  }

  // Get current transfer speed from SpeedCalculator and update network performance
  private updateNetworkFromSpeed(peerId: string): void {
    const currentSpeed = this.speedCalculator.getSendSpeed(peerId); // KB/s
    if (currentSpeed > 0) {
      const perf = this.networkPerformance.get(peerId);
      if (perf) {
        perf.avgClearingRate = currentSpeed;
        perf.sampleCount++;

        // Adjust threshold every 10 speed updates
        if (perf.sampleCount % 10 === 0) {
          this.adjustOptimalThreshold(perf);
        }
      }
    }
  }

  // Shared logic for adjusting optimal threshold
  private adjustOptimalThreshold(perf: {
    avgClearingRate: number;
    optimalThreshold: number;
    avgWaitTime: number;
    sampleCount: number;
  }): void {
    if (perf.avgClearingRate > 8000) {
      // >8MB/s network is good
      perf.optimalThreshold = Math.max(
        FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD,
        6291456
      ); // 6MB
    } else if (perf.avgClearingRate > 4000) {
      // >4MB/s network is average
      perf.optimalThreshold = FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD; // 3MB
    } else {
      // Poor network
      perf.optimalThreshold = Math.min(
        FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD,
        1572864
      ); // 1.5MB
    }
  }

  // Adaptive network performance learning (learn from backpressure waiting)
  private updateNetworkPerformance(
    peerId: string,
    clearingRate: number,
    waitTime: number
  ): void {
    if (!this.networkPerformance.has(peerId)) {
      this.initializeNetworkPerformance(peerId);
    }

    const perf = this.networkPerformance.get(peerId)!;
    perf.sampleCount++;
    // Exponential moving average, with higher weight for new data
    const alpha = 0.3;
    perf.avgClearingRate =
      perf.avgClearingRate * (1 - alpha) + clearingRate * alpha;
    perf.avgWaitTime = perf.avgWaitTime * (1 - alpha) + waitTime * alpha;
    // Adjust optimal threshold
    this.adjustOptimalThreshold(perf);
  }

  // Get adaptive threshold
  private getAdaptiveThreshold(peerId: string): number {
    const perf = this.networkPerformance.get(peerId);
    return perf
      ? perf.optimalThreshold
      : FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD;
  }

  // Adaptive intelligent send control strategy
  private async intelligentSendControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<"AGGRESSIVE" | "NORMAL" | "CAUTIOUS" | "WAIT"> {
    const bufferedAmount = dataChannel.bufferedAmount;
    const adaptiveThreshold = this.getAdaptiveThreshold(peerId);
    const utilizationRate = bufferedAmount / adaptiveThreshold;

    // Dynamically adjust strategy thresholds: based on network performance
    const perf = this.networkPerformance.get(peerId);
    const networkQuality = perf
      ? perf.avgClearingRate > 6000
        ? "good"
        : "poor"
      : "unknown";

    let aggressiveThreshold = 0.3;
    let normalThreshold = 0.6;
    let cautiousThreshold = 0.9;

    if (networkQuality === "good") {
      // Good network: more aggressive strategy
      aggressiveThreshold = 0.4; // Actively send below 40%
      normalThreshold = 0.7; // Normal send below 70%
    } else if (networkQuality === "poor") {
      // Poor network: more conservative strategy
      aggressiveThreshold = 0.2; // Actively send only below 20%
      normalThreshold = 0.5; // Normal send below 50%
      cautiousThreshold = 0.8; // Wait above 80%
    }
    if (utilizationRate < aggressiveThreshold) {
      return "AGGRESSIVE";
    } else if (utilizationRate < normalThreshold) {
      return "NORMAL";
    } else if (utilizationRate < cautiousThreshold) {
      return "CAUTIOUS";
    } else {
      return "WAIT";
    }
  }

  // Intelligent waiting strategy - adjust send control based on buffer status
  private async smartBufferControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<void> {
    const strategy = await this.intelligentSendControl(dataChannel, peerId);

    if (strategy === "AGGRESSIVE") {
      // Aggressive mode: no need to wait, send immediately
      return;
    } else if (strategy === "NORMAL") {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      // Normal mode: slight wait
      return;
    } else if (strategy === "CAUTIOUS") {
      // Cautious mode: brief wait to let the network consume some data
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      return;
    }

    // WAIT mode: requires active polling wait
    const POLLING_INTERVAL = 5;
    const MAX_WAIT_TIME = 3000;
    const startTime = Date.now();
    const adaptiveThreshold = this.getAdaptiveThreshold(peerId);
    const threshold_low = adaptiveThreshold * 0.3;
    const initialBuffered = dataChannel.bufferedAmount;
    let pollCount = 0;
    while (dataChannel.bufferedAmount > threshold_low) {
      pollCount++;

      if (Date.now() - startTime > MAX_WAIT_TIME) {
        this.log("warn", "Buffer wait timeout", {
          bufferedAmount: dataChannel.bufferedAmount,
          threshold: adaptiveThreshold,
          waitTime: Date.now() - startTime,
        });
        break;
      }

      await new Promise<void>((resolve) =>
        setTimeout(resolve, POLLING_INTERVAL)
      );
    }

    // Record wait end status
    const waitTime = Date.now() - startTime;
    const finalBuffered = dataChannel.bufferedAmount;
    const clearedBytes = initialBuffered - finalBuffered;
    const clearingRate =
      waitTime > 0 ? clearedBytes / 1024 / (waitTime / 1000) : 0;

    // Update network performance learning
    if (clearingRate > 0) {
      this.updateNetworkPerformance(peerId, clearingRate, waitTime);
    }
  }

  // Optimized method for reading a single file chunk
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
      fileReader.onerror = () =>
        reject(fileReader.error || new Error("Read error"));
      fileReader.readAsArrayBuffer(slice);
    });
  }

  // Batch read multiple file chunks to improve I/O performance
  private async readMultipleChunks(
    fileReader: FileReader,
    file: CustomFile,
    startOffset: number,
    chunkSize: number,
    batchSize: number
  ): Promise<ArrayBuffer[]> {
    const chunks: ArrayBuffer[] = [];
    const remainingSize = file.size - startOffset;
    const actualBatchSize = Math.min(
      batchSize,
      Math.ceil(remainingSize / chunkSize)
    );

    for (let i = 0; i < actualBatchSize; i++) {
      const offset = startOffset + i * chunkSize;
      if (offset >= file.size) break;

      const currentChunkSize = Math.min(chunkSize, file.size - offset);
      const chunk = await this.readSingleChunk(
        fileReader,
        file,
        offset,
        currentChunkSize
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  // Unified optimized version - uses batch reading + loop, suitable for all devices
  private async processSendQueue(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.getPeerState(peerId);
    const fileReader = new FileReader();

    let offset = peerState.readOffset || 0;
    const batchSize = FileSender.OPTIMIZED_CONFIG.BATCH_SIZE;
    let totalChunksSent = 0;
    let totalBytesSentInLoop = 0;

    // Initialize network performance monitoring
    this.initializeNetworkPerformance(peerId);

    try {
      let loopCount = 0;
      // Use batch reading + loop instead of traditional recursion to greatly improve performance
      while (offset < file.size && peerState.isSending) {
        loopCount++;

        // Batch read multiple large chunks - fully utilize memory advantages
        const chunks = await this.readMultipleChunks(
          fileReader,
          file,
          offset,
          this.chunkSize,
          batchSize
        );

        if (chunks.length === 0) break;

        for (const chunk of chunks) {
          if (!peerState.isSending || offset >= file.size) break;

          // 🔧 修复：检查发送是否成功
          let sendSuccessful = false;
          try {
            await this.sendWithBackpressure(chunk, peerId);
            sendSuccessful = true;

            totalChunksSent++;
            totalBytesSentInLoop += chunk.byteLength;
          } catch (error) {
            postLogToBackend(
              `[Firefox Debug] ❌ Failed to send chunk ${
                totalChunksSent + 1
              }: ${error}`
            );
            sendSuccessful = false;
            // 不更新统计，但继续尝试发送下一个chunk
          }

          // Update progress only if send was successful
          if (sendSuccessful) {
            offset += chunk.byteLength;
            peerState.readOffset = offset;

            // Update file and folder progress with success flag
            await this.updateProgress(
              chunk.byteLength,
              fileId,
              file.size,
              peerId,
              true // 明确标记为发送成功
            );
          } else {
            // 发送失败但不中止传输，记录失败信息
            postLogToBackend(
              `[Firefox Debug] 🔄 Chunk send failed but continuing... failed chunks will be missing from total`
            );
          }
        }
      }

      postLogToBackend(
        `[Firefox Debug] 🏁 All data sent, waiting for receiver to confirm completion...`
      );
    } catch (error: any) {
      const errorMessage = `Error in hybrid optimized transfer: ${error.message}`;
      postLogToBackend(
        `[Firefox Debug] ❌ Send error after ${totalChunksSent} chunks, ${totalBytesSentInLoop} bytes: ${errorMessage}`
      );
      this.fireError(errorMessage, {
        fileId,
        peerId,
        offset,
        totalChunksSent,
        totalBytesSentInLoop,
      });
      throw error;
    }
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
