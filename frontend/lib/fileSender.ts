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
  private pendingFiles: Map<string, CustomFile>;
  private pendingFolerMeta: Record<string, FolderMeta>;
  private speedCalculator: SpeedCalculator;

  // 自适应性能监控
  private networkPerformance: Map<
    string,
    {
      avgClearingRate: number; // 平均网络清理速度 KB/s
      optimalThreshold: number; // 动态优化的阈值
      avgWaitTime: number; // 平均等待时间
      sampleCount: number; // 采样次数
    }
  > = new Map();

  // 混合优化配置 - FileReader大块 + 网络小包策略（修复sendData failed）
  private static readonly OPTIMIZED_CONFIG = {
    CHUNK_SIZE: 4194304, // 4MB - 极致大块，最大化减少FileReader调用次数
    BATCH_SIZE: 8, // 8块批量 - 32MB批次处理成功
    NETWORK_CHUNK_SIZE: 65536, // 64KB - WebRTC安全发送大小，修复sendData failed
    BUFFER_THRESHOLD: 3145728, // 3MB - 阈值
    BACKPRESSURE_TIMEOUT: 2000, // 2秒超时 - 为大块处理预留更多时间
  } as const;

  constructor(WebRTC_initiator: WebRTC_Initiator) {
    this.webrtcConnection = WebRTC_initiator;

    // Maintain independent sending states for each receiver
    this.peerStates = new Map(); // Map<peerId, PeerState>

    // 统一使用优化参数 - 所有设备共享最佳配置
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
      await this.finalizeSendFile(fileId, peerId);

      await this.waitForTransferComplete(peerId); // Wait for transfer completion -- receiver confirmation
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

    // 持续更新网络性能（从传输速度学习）
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

    // 对于ArrayBuffer，如果超过64KB需要分片发送（修复sendData failed）
    if (data instanceof ArrayBuffer) {
      await this.sendLargeArrayBuffer(data, peerId);
    } else {
      // 字符串直接发送
      await this.sendSingleData(data, peerId);
    }
  }

  // 新增：分片发送大ArrayBuffer
  private async sendLargeArrayBuffer(
    data: ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const networkChunkSize = FileSender.OPTIMIZED_CONFIG.NETWORK_CHUNK_SIZE;
    const totalSize = data.byteLength;

    // 如果数据小于64KB，直接发送
    if (totalSize <= networkChunkSize) {
      await this.sendSingleData(data, peerId);
      return;
    }

    // 分片发送大块
    let offset = 0;
    let fragmentIndex = 0;

    while (offset < totalSize) {
      const chunkSize = Math.min(networkChunkSize, totalSize - offset);
      const chunk = data.slice(offset, offset + chunkSize);

      // 发送分片
      await this.sendSingleData(chunk, peerId);

      offset += chunkSize;
      fragmentIndex++;
    }
  }

  // 新增：单个数据包发送含主动轮询背压控制
  private async sendSingleData(
    data: string | ArrayBuffer,
    peerId: string
  ): Promise<void> {
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    if (!dataChannel) {
      throw new Error("Data channel not found");
    }
    // 智能发送控制 - 根据缓冲区状态决定发送策略
    await this.smartBufferControl(dataChannel, peerId);

    // 发送数据
    if (!this.webrtcConnection.sendData(data, peerId)) {
      throw new Error("sendData failed");
    }
  }

  // 初始化网络性能监控（传输开始时调用）
  private initializeNetworkPerformance(peerId: string): void {
    if (!this.networkPerformance.has(peerId)) {
      // 使用保守的初始值
      this.networkPerformance.set(peerId, {
        avgClearingRate: 5000, // 5MB/s初始估计
        optimalThreshold: FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD,
        avgWaitTime: 50, // 50ms初始估计
        sampleCount: 0,
      });
    }
  }

  // 从SpeedCalculator获取当前传输速度并更新网络性能
  private updateNetworkFromSpeed(peerId: string): void {
    const currentSpeed = this.speedCalculator.getSendSpeed(peerId); // KB/s
    if (currentSpeed > 0) {
      const perf = this.networkPerformance.get(peerId);
      if (perf) {
        perf.avgClearingRate = currentSpeed;
        perf.sampleCount++;

        // 每10次速度更新时调整阈值
        if (perf.sampleCount % 10 === 0) {
          this.adjustOptimalThreshold(perf);
        }
      }
    }
  }

  // 调整最优阈值的共用逻辑
  private adjustOptimalThreshold(perf: {
    avgClearingRate: number;
    optimalThreshold: number;
    avgWaitTime: number;
    sampleCount: number;
  }): void {
    if (perf.avgClearingRate > 8000) {
      // >8MB/s网络很好
      perf.optimalThreshold = Math.max(
        FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD,
        6291456
      ); // 6MB
    } else if (perf.avgClearingRate > 4000) {
      // >4MB/s网络一般
      perf.optimalThreshold = FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD; // 3MB
    } else {
      // 网络较差
      perf.optimalThreshold = Math.min(
        FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD,
        1572864
      ); // 1.5MB
    }
  }

  // 自适应网络性能学习（从背压等待中学习）
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
    // 指数移动平均，新数据权重更高
    const alpha = 0.3;
    perf.avgClearingRate =
      perf.avgClearingRate * (1 - alpha) + clearingRate * alpha;
    perf.avgWaitTime = perf.avgWaitTime * (1 - alpha) + waitTime * alpha;
    // 调整最优阈值
    this.adjustOptimalThreshold(perf);
  }

  // 获取自适应阈值
  private getAdaptiveThreshold(peerId: string): number {
    const perf = this.networkPerformance.get(peerId);
    return perf
      ? perf.optimalThreshold
      : FileSender.OPTIMIZED_CONFIG.BUFFER_THRESHOLD;
  }

  // 自适应智能发送控制策略
  private async intelligentSendControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<"AGGRESSIVE" | "NORMAL" | "CAUTIOUS" | "WAIT"> {
    const bufferedAmount = dataChannel.bufferedAmount;
    const adaptiveThreshold = this.getAdaptiveThreshold(peerId);
    const utilizationRate = bufferedAmount / adaptiveThreshold;

    // 动态调整策略阈值：基于网络性能
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
      // 网络好：更激进的策略
      aggressiveThreshold = 0.4; // 40%以下积极发送
      normalThreshold = 0.7; // 70%以下正常发送
    } else if (networkQuality === "poor") {
      // 网络差：更保守的策略
      aggressiveThreshold = 0.2; // 20%以下才积极发送
      normalThreshold = 0.5; // 50%以下正常发送
      cautiousThreshold = 0.8; // 80%以上就要等待
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

  // 智能等待策略 - 根据缓冲区状态调整发送控制
  private async smartBufferControl(
    dataChannel: RTCDataChannel,
    peerId: string
  ): Promise<void> {
    const strategy = await this.intelligentSendControl(dataChannel, peerId);

    if (strategy === "AGGRESSIVE") {
      // 积极模式：无需等待，立即发送
      return;
    } else if (strategy === "NORMAL") {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      // 正常模式：少许等待
      return;
    } else if (strategy === "CAUTIOUS") {
      // 谨慎模式：短暂等待让网络消费一些数据
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      return;
    }

    // WAIT模式：需要主动轮询等待
    const POLLING_INTERVAL = 5;
    const MAX_WAIT_TIME = 3000;
    const startTime = Date.now();
    const adaptiveThreshold = this.getAdaptiveThreshold(peerId);
    const threshold_75 = adaptiveThreshold * 0.75;
    const initialBuffered = dataChannel.bufferedAmount;
    let pollCount = 0;
    while (dataChannel.bufferedAmount > threshold_75) {
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

    // 记录等待结束状态
    const waitTime = Date.now() - startTime;
    const finalBuffered = dataChannel.bufferedAmount;
    const clearedBytes = initialBuffered - finalBuffered;
    const clearingRate =
      waitTime > 0 ? clearedBytes / 1024 / (waitTime / 1000) : 0;

    // 更新网络性能学习
    if (clearingRate > 0) {
      this.updateNetworkPerformance(peerId, clearingRate, waitTime);
    }
  }

  // 读取单个文件块的优化方法
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

  // 批量读取多个文件块，提升I/O性能
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

  // 统一优化版本 - 使用批量读取+循环，适用于所有设备
  private async processSendQueue(
    file: CustomFile,
    peerId: string
  ): Promise<void> {
    const fileId = generateFileId(file);
    const peerState = this.getPeerState(peerId);
    const fileReader = new FileReader();

    let offset = peerState.readOffset || 0;
    const batchSize = FileSender.OPTIMIZED_CONFIG.BATCH_SIZE;

    // 初始化网络性能监控
    this.initializeNetworkPerformance(peerId);

    try {
      // 使用批量读取+循环替代传统递归，大幅提升性能
      while (offset < file.size && peerState.isSending) {

        // 批量读取多个大块 - 充分利用内存优势
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
          // 使用标准的智能控制发送
          await this.sendWithBackpressure(chunk, peerId);

          // 更新进度
          offset += chunk.byteLength;
          peerState.readOffset = offset;

          // 更新文件和文件夹进度
          await this.updateProgress(
            chunk.byteLength,
            fileId,
            file.size,
            peerId
          );
        }
      }
      // 文件发送完毕
      if (offset >= file.size && !peerState.currentFolderName) {
        peerState.progressCallback?.(fileId, 1, 0);
      }
    } catch (error: any) {
      const errorMessage = `Error in hybrid optimized transfer: ${error.message}`;
      this.fireError(errorMessage, {
        fileId,
        peerId,
        offset,
      });
      throw error;
    }
  }

  //send fileEnd signal
  private async finalizeSendFile(fileId: string, peerId: string): Promise<void> {
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
