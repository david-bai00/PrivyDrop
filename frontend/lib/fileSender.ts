//发送文件（夹）的流程：先发送文件 meta 信息，等待接收端请求，再发送文件内容，文件发送完再发送endMeta，等待接收端ack，结束
//发送文件夹的流程（同上）：接收批量文件请求
//循环发送所有文件的meta，然后把属于folder的部分关于文件大小的记录下来，用于计算进度。接收展示端来区分单文件和文件夹
import {SpeedCalculator,generateFileId}  from '@/lib/myUtils';
import WebRTC_Initiator from './webrtc_Initiator';
import {
  CustomFile,
  fileMetadata,
  WebRTCMessage,
  PeerState,
  FolderMeta,
  FileRequest
} from '@/lib/types/file';

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
    this.maxBufferSize = 5; // 预读取的块数
    this.pendingFiles = new Map();//所有待发送的文件（引用）{fileId:CustomFile}

    this.pendingFolerMeta = {};//文件夹对应的meta属性(总大小、文件总个数)，用于记录传输进度,fileId:{totalSize:0 , fileIds:[]}

    // 创建 SpeedCalculator 实例
    this.speedCalculator = new SpeedCalculator();

    this.setupDataHandler();
  }
  // 初始化新接收方的状态
  private getPeerState(peerId: string): PeerState {
    if (!this.peerStates.has(peerId)) {
      this.peerStates.set(peerId, {
        isSending: false,//用来判断文件是否发送成功，发送前是 true， 发送完接收到ack是 false
        bufferQueue: [],//预读取buffer，提高发送效率
        readOffset: 0,//读取位置，发送函数用
        isReading: false,//是否正在读取，发送函数用，避免重复读取

        currentFolderName: '',//如果当前发送的文件属于文件夹，则赋 文件夹名
        totalBytesSent:{},//文件(夹)已发送字节数，用于计算进度;{fileId:0}
        progressCallback: null,//进度回调
      });
    }
    return this.peerStates.get(peerId)!;//! 非空断言（Non-Null Assertion Operator）
  }
  private setupDataHandler(): void {
    this.webrtcConnection.onDataReceived = (data: string | ArrayBuffer, peerId: string) => {
      this.handleReceivedData(data, peerId);
    };
  }

  public setProgressCallback(
    callback: (fileId: string, progress: number, speed: number) => void,
    peerId: string
  ): void {
    const peerState = this.getPeerState(peerId);
    peerState.progressCallback = callback;
  }

  private handleReceivedData(data: string | ArrayBuffer, peerId: string): void {
    if (typeof data === 'string') {
      try {
        const parsedData = JSON.parse(data) as WebRTCMessage;
        const peerState = this.getPeerState(peerId);

        const handlers: Record<string, () => void> = {
          fileRequest: () => this.handleFileRequest(parsedData as FileRequest, peerId),
          fileAck: () => {
            peerState.isSending = false;
            console.log(`Receive file-finish ack from peer ${peerId}`);
          }
        };

        const handler = handlers[parsedData.type];
        if (handler) handler();
        
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
    }
  }
  //响应 文件请求，发送文件
  private async handleFileRequest(
    request: FileRequest,
    peerId: string
  ): Promise<void> {
    const file = this.pendingFiles.get(request.fileId);
    console.log('handleFileRequest',file,peerId);
    if (file) {
      await this.sendSingleFile(file, peerId);
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
        type: 'stringMetadata',
        length: content.length
      }), 
      peerId
    );

    // 依次发送每个分片，使用背压控制
    for (let i = 0; i < chunks.length; i++) {
      const data = JSON.stringify({
        type: 'string',
        chunk: chunks[i],
        index: i,
        total: chunks.length
      });
      await this.sendWithBackpressure(data, peerId);
    }
  }

  public sendFileMeta(files: CustomFile[], peerId?: string): void {
    
    //把属于folder的部分关于文件大小的记录下来，用于计算进度
    for (const file of files) {
      if (file.folderName){
        const fileId = file.folderName;
        //folderName:{totalSize:0 , fileIds:[]}
        if (!(file.folderName in this.pendingFolerMeta)) {//初始化
          this.pendingFolerMeta[fileId] = {totalSize:0 , fileIds:[]};
        }
        const folderMeta = this.pendingFolerMeta[fileId];
        const fileId2 = generateFileId(file);
        if (!folderMeta.fileIds.includes(fileId2)){//如果文件没被添加过
          folderMeta.fileIds.push(fileId2);
          folderMeta.totalSize += file.size;
        }
      }
    }
    //循环发送所有文件的meta
    const sendToPeers = peerId ? [peerId] : Array.from(this.peerStates.keys());
    for (const currentPeerId of sendToPeers) {
      for (const file of files) {
        const fileId = generateFileId(file);
        this.pendingFiles.set(fileId, file);

        const fileMeta = this.getFileMeta(file);
        console.log('fileMeta',fileMeta);
        this.webrtcConnection.sendData(JSON.stringify(fileMeta), currentPeerId);
      }
    }
  }
  
  //发送单个文件
  private async sendSingleFile(file: CustomFile, peerId: string): Promise<void> {
    const fileId = generateFileId(file);
    
    const peerState = this.getPeerState(peerId);
    peerState.isSending = true;
    peerState.currentFolderName = file.folderName;
    console.log('sendSingleFile',peerId,peerState);
    await this.startSendingFile(fileId, peerId);

    // 如果当前正在传输文件,则等待传输完成--接收方确认
    await this.waitForTransferComplete(peerId);
    console.log(`fileId:${fileId} send done or already sent to peer ${peerId}`);
  }

  private async waitForTransferComplete(peerId: string): Promise<void> {
    const peerState = this.getPeerState(peerId);
    while (peerState?.isSending) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private getFileMeta(file: CustomFile): fileMetadata {
    const fileId = generateFileId(file);
    const metadata = {type: 'fileMeta',fileId,name: file.name,
      size: file.size,fileType: file.type,fullName: file.fullName,folderName:file.folderName
    };
    return metadata;
  }
  //同步 文件夹 进度--包含回调
  private syncFolderProgress(fileId: string, peerId: string): void {
    const folderMeta = this.pendingFolerMeta[fileId];//fileId:{totalSize:0 , fileIds:[]}
    const peerState = this.getPeerState(peerId);
    if (!peerState) return;
    
    this.speedCalculator.updateSendSpeed(peerId, peerState.totalBytesSent[fileId]);// 使用累计接收量
    const speed = this.speedCalculator.getSendSpeed(peerId);

    const progress = peerState.totalBytesSent[fileId] / folderMeta.totalSize;
    peerState.progressCallback?.(fileId, progress, speed);
  }
  //更新传输进度,并进行回调
  private async updateProgress(byteLength: number, fileId: string, fileSize: number, peerId: string): Promise<void>  {
    const peerState = this.getPeerState(peerId);
    if (!peerState) return;
    
    if (peerState.currentFolderName) {//文件夹状态
      this.syncFolderProgress(fileId, peerId);
    } else {// 单文件状态
      const progress = peerState.totalBytesSent[fileId] / fileSize;

      this.speedCalculator.updateSendSpeed(peerId, peerState.totalBytesSent[fileId]);// 使用累计接收量
      const speed = this.speedCalculator.getSendSpeed(peerId);

      peerState.progressCallback?.(fileId, progress, speed);
    }
    
  }

  private async sendWithBackpressure(data: string | ArrayBuffer, peerId: string) : Promise<boolean>{
    const dataChannel = this.webrtcConnection.dataChannels.get(peerId);
    if (!dataChannel) return false;

    const threshold = dataChannel.bufferedAmountLowThreshold;
    if (dataChannel.bufferedAmount > threshold) {
      await new Promise<void>(resolve => {
        const onBufferedAmountLow = () => {
          dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
          resolve();
        };
        dataChannel.addEventListener('bufferedamountlow', onBufferedAmountLow);
      });
    }
    
    return this.webrtcConnection.sendData(data, peerId);
  }
  //开始发送文件内容
  private async startSendingFile(fileId: string, peerId: string): Promise<void> {
    const file = this.pendingFiles.get(fileId);
    if (!file) return;

    const peerState = this.getPeerState(peerId);
    const folderId = peerState.currentFolderName?? '';//fileId

    if(peerState.currentFolderName){//当前属于文件夹
      const index = this.pendingFolerMeta[folderId].fileIds.indexOf(fileId);
      if (index === 0){//发送第一个时清零
        peerState.totalBytesSent[folderId] = 0;//记录文件夹 总发送字节数
      }
    }
    peerState.totalBytesSent[fileId] = 0;//记录 当前文件 总发送字节数
    peerState.readOffset = 0;
    peerState.isReading = false;

    const fileReader = new FileReader();

    const readNextChunk = async (): Promise<void> => {
      if (peerState.isReading) return;
      peerState.isReading = true;
      while (peerState.bufferQueue.length < this.maxBufferSize && peerState.readOffset < file.size) {
        const slice = file.slice(peerState.readOffset, peerState.readOffset + this.chunkSize);
        try {
          const chunk = await this.readChunkAsArrayBuffer(fileReader, slice);
          peerState.bufferQueue.push(chunk);
          peerState.readOffset += chunk.byteLength;
        } catch (error) {
          console.error("Error reading file chunk:", error);
          break;
        }
      }
      peerState.isReading = false;
    };

    const sendNextChunk = async (): Promise<void> => {
      if (peerState.bufferQueue.length > 0) {
        const chunk = peerState.bufferQueue.shift()!;
        await this.sendWithBackpressure(chunk, peerId);

        if(peerState.currentFolderName){//当前属于文件夹
          peerState.totalBytesSent[folderId] += chunk.byteLength;
          await this.updateProgress(chunk.byteLength, folderId, file.size, peerId);//更新文件（夹）的进度
        }else{
          await this.updateProgress(chunk.byteLength, fileId, file.size, peerId);//更新文件的进度
        }
        peerState.totalBytesSent[fileId] += chunk.byteLength;
        
        if (peerState.totalBytesSent[fileId] < file.size) {//没发送完，继续发送
          await readNextChunk();
          sendNextChunk();
        } else {
          const speed = this.speedCalculator.getSendSpeed(peerId);
          if(!peerState.currentFolderName)
            peerState.progressCallback?.(fileId, 1, speed);//传输单文件时回传
          
          this.finalizeSendFile(fileId, peerId);//发送完，再发送 fileEnd 信号
        }
      } else if (peerState.totalBytesSent[fileId] < file.size) {//缓冲队列为空，继续读取和发送
        await readNextChunk();
        sendNextChunk();
      }
    };

    await readNextChunk();//开始读取和发送
    sendNextChunk();
  }

  private readChunkAsArrayBuffer(fileReader: FileReader, blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      fileReader.onload = (e) => {
        // 确保 e.target.result 是 ArrayBuffer
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(e.target.result);
        } else {
          reject(new Error("Failed to read blob as ArrayBuffer"));
        }
      };
      fileReader.onerror = (error) => reject(error);
      fileReader.readAsArrayBuffer(blob);
    });
  }
  //发送 fileEnd 信号
  private finalizeSendFile(fileId: string, peerId: string): void {
    const endMessage = JSON.stringify({
      type: 'fileEnd',
      fileId: fileId
    });
    this.webrtcConnection.sendData(endMessage, peerId);
  }
}

export default FileSender;