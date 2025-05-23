export interface Progress {//file Progress
    progress: number;
    speed: number;
}
export interface CustomFile extends File {// CustomFile 扩展了 File 接口,任然是File对象
    fullName: string;//文件路径，格式:root+...+filename，比如test/test.txt,test/sub/test2.txt，root是拖拽的文件夹名
    folderName: string;//该文件所属文件夹，如果没有则为空,eg:root or test or ''
}
export interface FileMeta {//单文件和文件夹共用这个接口
    name: string;//fileName or folderName
    size: number;//对于文件夹是total size
    fullName: string;//文件路径，格式:root+...+filename
    folderName: string;
    fileType: string;//与通信中的type区分开
    fileId: string;//文件夹暂时 等于 folderName
    fileCount?: number;//文件夹才有
    fileNamesDis?: string;//文件夹下所有文件名的展示
}
export interface fileMetadata extends FileMeta {
    type: string;
}

export interface FileRequest {
    type: 'fileRequest';
    fileId: string;
}

export interface FileAck {
    type: 'fileAck';
    fileId: string;
}

export interface StringMetadata {
    type: 'stringMetadata';
    length: number;
}

export interface StringChunk {
    type: 'string';
    chunk: string;
    index: number;
    total: number;
}

export interface FileEnd {
    type: 'fileEnd';
    fileId: string;
}
  
export type WebRTCMessage = fileMetadata | FileRequest | FileAck | StringMetadata | StringChunk | FileEnd;
  
export interface FolderMeta {
    totalSize: number;
    fileIds: string[];
}

export interface FolderProgress extends FolderMeta {
  receivedSize: number;
}
  
export interface PeerState {
    isSending: boolean;
    bufferQueue: ArrayBuffer[];
    readOffset: number;
    isReading: boolean;
    totalBytesSent: Record<string, number>;
    progressCallback: ((id: string, progress: number, speed: number) => void) | null;
    currentFolderName?: string;
}

export interface CurrentString {
  length: number;
  chunks: string[];
  receivedChunks: number;
}

export interface FileHandlers {
  string: (data: any, peerId: string) => void;
  stringMetadata: (data: any, peerId: string) => void;
  fileMeta: (data: any, peerId: string) => Promise<void>;
  fileEnd: (data: any) => Promise<void>;
}