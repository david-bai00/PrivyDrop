// 发送文件（夹）的流程：先发送文件 meta 信息，等待接收端请求，再发送文件内容，文件发送完再发送endMeta，等待接收端ack，结束
// 发送文件夹的流程（同上）：接收批量文件请求
// 循环发送所有文件的meta，然后把属于folder的部分关于文件大小的记录下来，用于计算进度。接收展示端来区分单文件和文件夹
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

    // 为每个接收方维护独立的发送状态
    this.peerStates = new Map(); // Map<peerId, PeerState>

    this.chunkSize = 65536; // 64 KB chunks
    this.maxBufferSize = 10; // 预读取的块数
    this.pendingFiles = new Map(); //所有待发送的文件（引用）{fileId:CustomFile}

    this.pendingFolerMeta = {}; //文件夹对应的meta属性(总大小、文件总个数)，用于记录传输进度,fileId:{totalSize:0 , fileIds:[]}

    // 创建 SpeedCalculator 实例
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
  // 初始化新接收方的状态
  private getPeerState(peerId: string): PeerState {
    if (!this.peerStates.has(peerId)) {
      this.peerStates.set(peerId, {
        isSending: false, //用来判断文件是否发送成功，发送前是 true， 发送完接收到ack是 false
        bufferQueue: [], //预读取buffer，提高发送效率
        readOffset: 0, //读取位置，发送函数用
        isReading: false, //是否正在读取，发送函数用，避免重复读取

        currentFolderName: "", //如果当前发送的文件属于文件夹，则赋 文件夹名
        totalBytesSent: {}, //文件(夹)已发送字节数，用于计算进度;{fileId:0}
        progressCallback: null, //进度回调
      });
    }
    return this.peerStates.get(peerId)!; //! 非空断言（Non-Null Assertion Operator）
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
  //响应 文件请求，发送文件
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
  // 修改发送字符串的方法为异步方法
  public async sendString(content: string, peerId: string): Promise<void> {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += this.chunkSize) {
      chunks.push(content.slice(i, i + this.chunkSize));
    }

    // 先发送元数据
    await this.sendWithBackpressure(
      JSON.stringify({
        type: "stringMetadata",
        length: content.length,
      }),
      peerId
    );

    // 依次发送每个分片，使用背压控制
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
    //把属于folder的部分关于文件大小的记录下来，用于计算进度
    files.forEach((file) => {
      if (file.folderName) {
        const folderId = file.folderName;
        //folderName:{totalSize:0 , fileIds:[]}
        if (!this.pendingFolerMeta[folderId]) {
          this.pendingFolerMeta[folderId] = { totalSize: 0, fileIds: [] };
        }
        const folderMeta = this.pendingFolerMeta[folderId];
        const fileId = generateFileId(file);
        if (!folderMeta.fileIds.includes(fileId)) {
          //如果文件没被添加过
          folderMeta.fileIds.push(fileId);
          folderMeta.totalSize += file.size;
        }
      }
    });
    //循环发送所有文件的meta
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

  //发送单个文件
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

      await this.waitForTransferComplete(peerId); // 等待传输完成--接收方确认
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
  //开始发送文件内容
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
        // 确保 e.target.result 是 ArrayBuffer
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
  //发送 fileEnd 信号
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
