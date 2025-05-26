//接收文件(夹)的流程：先批量接收文件 meta 信息，【判断是否需要让用户选择保存目录】，然后点击请求，再接收文件内容，接收到endMeta之后，发送ack，结束
//发送文件夹的流程（同上）：接收批量文件请求
import { SpeedCalculator } from "@/lib/myUtils";
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
} from "@/lib/types/file";

class FileReceiver {
  private webrtcConnection: WebRTC_Recipient;
  private readonly largeFileThreshold: number;
  private currentFileMeta: fileMetadata | null;
  private currentFolderName: string | null;
  private currentFileChunks: (ArrayBuffer | null)[];
  private writeStream: FileSystemWritableFileStream | null;
  private currentFileHandle: FileSystemFileHandle | null;
  private folderProgresses: Record<string, FolderProgress>;
  public saveType: Record<string, boolean>;
  private saveDirectory: FileSystemDirectoryHandle | null;
  private pendingFilesMeta: Map<string, fileMetadata>;
  private fileReceiveDone: boolean;
  public onFileMetaReceived: ((meta: fileMetadata) => void) | null;
  public onStringReceived: ((str: string) => void) | null;
  private progressCallback:
    | ((id: string, progress: number, speed: number) => void)
    | null;
  public onFileReceived: ((file: CustomFile) => Promise<void>) | null;
  private speedCalculator: SpeedCalculator;
  private peerId: string;
  private readonly chunkSize: number;
  private currentString: CurrentString | null;
  private fileHandlers: FileHandlers;
  constructor(WebRTC_recipient: WebRTC_Recipient) {
    this.webrtcConnection = WebRTC_recipient;
    this.largeFileThreshold = 1 * 1024 * 1024 * 1024; // 1 * 1GB,如果大于这个阈值，则需要用户选择保存目录直接储存在磁盘
    // 当前接收状态
    this.currentFileMeta = null; //有meta信息--表示当前正在接收该文件，为null--当前没有接收文件
    this.currentFolderName = null; //有name--表示当前正在接收文件夹，为null--当前没有接收文件夹
    this.currentFileChunks = []; //接收的（存放内存的）文件块

    this.writeStream = null; //写入磁盘相关对象
    this.currentFileHandle = null; //写入磁盘相关对象--当前文件

    this.folderProgresses = {}; // 文件夹 进度信息, fileId:{totalSize:0,receivedSize:0,fileIds:[]};

    this.saveType = {}; //fileId:IsSaveToDisk,表示已接收到的文件是存储在磁盘还是内存
    // 存储目录
    this.saveDirectory = null;

    // 待接收文件管理--用来展示
    this.pendingFilesMeta = new Map(); // 存储文件元信息,fileId:meta
    this.fileReceiveDone = false; //当前文件是否接收处理完
    // 回调函数
    this.onFileMetaReceived = null;
    this.onStringReceived = null;
    this.progressCallback = null;
    this.onFileReceived = null; //接收到文件的回调,由上层区分属于哪个文件夹

    // 创建 SpeedCalculator 实例
    this.speedCalculator = new SpeedCalculator();

    this.peerId = ""; //唯一一个连接方

    this.chunkSize = 65536; // 64 KB chunks
    this.currentString = null;

    this.setupDataHandler();

    this.fileHandlers = {
      string: this.handleReceivedStringChunk.bind(this),
      stringMetadata: this.handleStringMetadata.bind(this),

      fileMeta: this.handleFileMetadata.bind(this),
      fileEnd: this.handleFileEnd.bind(this),
    };
  }

  private setupDataHandler(): void {
    this.webrtcConnection.onDataReceived = this.handleReceivedData.bind(this);
  }

  public setProgressCallback(
    callback: (fileId: string, progress: number, speed: number) => void
  ): void {
    this.progressCallback = callback;
  }

  private async handleReceivedData(
    data: string | ArrayBuffer,
    peerId: string
  ): Promise<void> {
    if (typeof data === "string") {
      try {
        const parsedData = JSON.parse(data) as WebRTCMessage;
        const handler =
          this.fileHandlers[parsedData.type as keyof FileHandlers];
        if (handler) {
          await handler(parsedData, peerId);
        }
      } catch (error) {
        console.error("Error parsing JSON:", error);
      }
    } else if (data instanceof ArrayBuffer) {
      this.updateProgress(data.byteLength); //更新 进度
      await this.handleFileChunk(data); //接收数据
    }
  }

  private async handleFileMetadata(
    metadata: fileMetadata,
    peerId: string
  ): Promise<void> {
    this.peerId = peerId;
    console.log("fileMeta", metadata);
    if (this.pendingFilesMeta.has(metadata.fileId)) return; //如果已经接收过，则忽略
    this.pendingFilesMeta.set(metadata.fileId, metadata); //fileId:meta
    this.onFileMetaReceived?.(metadata);

    //把属于folder的部分关于文件大小的记录下来，用于计算进度
    const folderName = metadata.folderName;
    if (folderName) {
      const fileId = folderName;
      if (!(fileId in this.folderProgresses)) {
        //初始化
        this.folderProgresses[fileId] = {
          totalSize: 0,
          receivedSize: 0,
          fileIds: [],
        }; //fileId:{totalSize:0,receivedSize:0,fileIds:[]};
      }
      const folderProgress = this.folderProgresses[fileId];
      if (!folderProgress.fileIds.includes(metadata.fileId)) {
        //防止重复计算
        folderProgress.totalSize += metadata.size;
        folderProgress.fileIds.push(metadata.fileId);
      }
    }
  }
  //同步 文件夹 进度--包含回调
  private syncFolderProgress(fileId: string, bytesReceived: number): void {
    const folderProgress = this.folderProgresses[fileId];
    if (!folderProgress) return;
    folderProgress.receivedSize += bytesReceived;

    this.speedCalculator.updateSendSpeed(
      this.peerId,
      folderProgress.receivedSize
    ); // 使用累计接收量
    const speed = this.speedCalculator.getSendSpeed(this.peerId);

    const progress = folderProgress.receivedSize / folderProgress.totalSize;
    this.progressCallback?.(fileId, progress, speed);
  }
  //更新 进度 并回调
  private async updateProgress(byteLength: number): Promise<void> {
    if (!this.peerId || !this.currentFileMeta) return;

    const fileId = this.currentFolderName
      ? this.currentFolderName
      : this.currentFileMeta.fileId;
    if (this.currentFolderName) {
      this.syncFolderProgress(fileId, byteLength); //接收文件夹，只回传总进度
    } else {
      const received = this.currentFileChunks.length * this.chunkSize;

      this.speedCalculator.updateSendSpeed(this.peerId, received); // 使用累计接收量
      const speed = this.speedCalculator.getSendSpeed(this.peerId);
      this.progressCallback?.(
        fileId,
        received / this.currentFileMeta.size,
        speed
      ); //同步 单文件 进度
    }
  }
  private handleStringMetadata(metadata: StringMetadata, peedId: string): void {
    this.currentString = {
      length: metadata.length,
      chunks: [],
      receivedChunks: 0,
    };
    // console.log("handleStringMetadata",this.currentString);
  }
  private handleReceivedStringChunk(data: StringChunk, peerId: string) {
    if (this.currentString) {
      this.currentString.chunks[data.index] = data.chunk;
      this.currentString.receivedChunks++;

      // console.log("handleReceivedStringChunk",this.currentString,data.total);
      if (this.currentString.receivedChunks === data.total) {
        const fullString = this.currentString.chunks.join("");
        // console.log("fullString",this.onStringReceived);
        this.onStringReceived?.(fullString);
        this.currentString = null;
      }
    }
  }
  private async handleFileEnd(metadata: FileEnd): Promise<void> {
    console.log("handleFileEnd,metadata", metadata);
    const file = this.pendingFilesMeta.get(metadata.fileId);
    if (file) {
      if (!this.currentFolderName) {
        //接收单独的文件时，回传进度
        this.progressCallback?.(file.fileId, 1, 0);
      }

      await this.finalizeFileReceive(); //接收完--处理
      this.sendFileAck(file.fileId); //文件接收完毕 -- 发ack信号
      this.fileReceiveDone = true; //当前文件接收处理完
      console.log("handleFileEnd,sendFileAck");
    }
  }
  private async finalizeFileReceive(): Promise<void> {
    if (!this.currentFileMeta) return;
    const fileId = this.currentFolderName;
    if (this.currentFileHandle) {
      //（已经选择过目录  直接保存到磁盘
      await this.finalizeLargeFileReceive(); //磁盘文件 完成终止
    } else {
      const fileBlob = new Blob(this.currentFileChunks as ArrayBuffer[], {
        type: this.currentFileMeta.fileType,
      });
      const file = new File([fileBlob], this.currentFileMeta.name, {
        type: this.currentFileMeta.fileType,
      });

      this.saveType[this.currentFileMeta.fileId] = false; //存放在内存
      if (fileId) this.saveType[fileId] = false; //对应的文件夹也存放在内存

      const customFile = Object.assign(file, {
        fullName: this.currentFileMeta.fullName,
        folderName: this.currentFolderName as string,
      });
      // console.log('finalizeFileReceive',customFile);
      await this.onFileReceived?.(customFile);
    }
    //如果是接收文件夹状态，则检查是不是最后一个文件，如果不是，则新建下一个文件的磁盘流

    if (this.currentFolderName && this.folderProgresses[fileId as string]) {
      const folderProgress = this.folderProgresses[fileId as string];
      const curIdx = folderProgress.fileIds.indexOf(
        this.currentFileMeta.fileId
      );
      const isLastFileInFolder = curIdx === folderProgress.fileIds.length - 1;

      this.resetFileReceiveState(); //重置状态

      if (!isLastFileInFolder) {
        const nextFileId = folderProgress.fileIds[curIdx + 1];
        const nextFileMeta = this.pendingFilesMeta.get(nextFileId);
        if (nextFileMeta) {
          this.currentFileMeta = nextFileMeta;
          if (this.saveDirectory)
            //如果选择过保存目录
            await this.creatDiskWriteStream(this.currentFileMeta); //根据当前fileMeta创建磁盘流
        }
      }
    } else {
      this.resetFileReceiveState();
    }
  }
  //重置 文件接收 状态
  private resetFileReceiveState(): void {
    this.currentFileMeta = null;
    this.currentFileChunks = [];
    this.currentFileHandle = null;
  }
  // 请求开始接收文件
  public async requestFile(fileId: string, singleFile = true): Promise<void> {
    if (fileId in this.saveType && this.saveType[fileId]) return; //已经请求过 & 并且保存在磁盘，不重复请求

    if (singleFile) this.currentFolderName = null; //不是在请求文件夹

    const fileInfo = this.pendingFilesMeta.get(fileId);
    // console.log('requestFile,fileInfo',fileInfo);
    if (!fileInfo) return;
    this.currentFileMeta = fileInfo; //当前正在接收的文件
    this.fileReceiveDone = false; //当前文件 没有 接收处理完
    if (
      this.saveDirectory ||
      fileInfo.size >= this.largeFileThreshold ||
      this.currentFolderName
    ) {
      //需要存储
      await this.creatDiskWriteStream(this.currentFileMeta); //存放在磁盘
    } else {
      this.currentFileChunks = [];
    }
    // console.log('send fileRequest,this.peerId',this.peerId);
    const request = JSON.stringify({ type: "fileRequest", fileId });
    if (this.peerId) {
      this.webrtcConnection.sendData(request, this.peerId);
    }

    // 如果当前正在传输文件,则等待传输完成--等发送fileAck
    await this.waitForTransferComplete();
  }
  private async waitForTransferComplete(): Promise<void> {
    while (!this.fileReceiveDone) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  // 请求开始接收文件夹,上层来区分 回传的文件 是否属于文件夹
  public async requestFolder(folderName: string): Promise<void> {
    const receivedFileIds = Object.keys(this.saveType);
    const received = receivedFileIds.some((fileId) => {
      //至少有一个满足
      const fileMeta = this.pendingFilesMeta.get(fileId);
      return (
        fileMeta?.folderName === folderName && this.saveType[fileMeta.fileId]
      );
    });
    console.log("requestFolder,received", received);
    if (received) return; //已经请求过 & 已经保存到磁盘，不重复请求

    const fileId = folderName;
    const folderProgress = this.folderProgresses[fileId];
    if (folderProgress) {
      this.currentFolderName = folderName; //请求文件夹
      for (const fileId of folderProgress.fileIds) {
        await this.requestFile(fileId, false);
      }
      this.currentFolderName = null; //请求文件夹结束--清空标注
    }
  }
  //接收文件 处理
  private async handleFileChunk(chunk: ArrayBuffer): Promise<void> {
    if (this.currentFileHandle) {
      await this.writeLargeFileChunk(chunk); //保存到磁盘
    } else {
      this.currentFileChunks.push(chunk); //保存到内存
    }
  }

  private sendFileAck(fileId: string): void {
    if (!this.peerId) return;

    const confirmation = JSON.stringify({
      type: "fileAck",
      fileId,
    });
    this.webrtcConnection.sendData(confirmation, this.peerId);
  }

  private async createFolderStructure(
    fullName: string
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.saveDirectory) {
      throw new Error("Save directory not set");
    }

    const parts_rela_path = fullName.split("/"); // 根据斜杠分割路径
    parts_rela_path.pop(); // 移除最后一个元素（文件名）

    console.log("createFolderStructure", fullName, parts_rela_path);
    let currentPath = this.saveDirectory;
    for (const part of parts_rela_path) {
      if (part) {
        currentPath = await currentPath.getDirectoryHandle(part, {
          create: true,
        });
      }
    }
    return currentPath;
  }
  public async setSaveDirectory(
    directory: FileSystemDirectoryHandle
  ): Promise<void> {
    this.saveDirectory = directory;
  }
  //建立磁盘写入流,存在保存目录的情况，否则还是保存在内存中
  public async creatDiskWriteStream(meta: FileMeta): Promise<void> {
    if (!this.saveDirectory) {
      console.log("Save directory not set");
      this.currentFileChunks = [];
    } else {
      try {
        const folderStructure = await this.createFolderStructure(meta.fullName);
        this.currentFileHandle = await folderStructure.getFileHandle(
          meta.name,
          { create: true }
        );

        this.writeStream = await this.currentFileHandle.createWritable();
      } catch (err) {
        console.error("Failed to create file:", err);
        console.log("Falling back to in-memory storage for large file");
        this.currentFileChunks = [];
      }
    }
  }
  //保存文件到磁盘
  private async writeLargeFileChunk(chunk: ArrayBuffer): Promise<void> {
    if (!this.writeStream) {
      //用户没有授权的情况，保存到内存
      this.currentFileChunks.push(chunk);
      return;
    }
    try {
      await this.writeStream.write(chunk); //写入磁盘
      this.currentFileChunks.push(null); // Just to keep track of the number of chunks
    } catch (error) {
      console.error("Error writing chunk:", error);
    }
  }
  //磁盘文件 完成终止
  private async finalizeLargeFileReceive(): Promise<void> {
    if (this.writeStream) {
      try {
        await this.writeStream.close();
      } catch (error) {
        console.error("Error closing write stream:", error);
      }
    }
    if (this.currentFileHandle && this.currentFileMeta) {
      //存在磁盘写入
      const file = await this.currentFileHandle.getFile(); //与发送端一样，只是拿到了磁盘文件的一个引用，不占用内存
      const customFile = Object.assign(file, {
        fullName: this.currentFileMeta.fullName,
        folderName: this.currentFolderName as string,
      });

      this.saveType[this.currentFileMeta.fileId] = true; //存放在磁盘

      if (!this.currentFolderName) {
        //如果当前处于接收文件夹的状态 & 写入磁盘了，则不回传文件，不支持下载
        await this.onFileReceived?.(customFile);
      } else {
        this.saveType[this.currentFolderName] = true; //对应的文件夹也存放在磁盘
      }
    }
  }
}

export default FileReceiver;
