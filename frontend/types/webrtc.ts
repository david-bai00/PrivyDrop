export interface Progress {
  // File Progress
  progress: number;
  speed: number;
}
export interface CustomFile extends File {
  // CustomFile extends the File interface, it is still a File object
  fullName: string; // File path, format: root+...+filename, e.g., test/test.txt, test/sub/test2.txt, where root is the dragged folder name
  folderName: string; // The folder to which the file belongs, empty if none, e.g., root or test or ''
}
export interface FileMeta {
  // This interface is shared by single files and folders
  name: string; // fileName or folderName
  size: number; // For folders, this is the total size
  fullName: string; // File path, format: root+...+filename
  folderName: string;
  fileType: string; // Distinguish from the 'type' in communication
  fileId: string; // For now, folder's fileId is equal to folderName
  fileCount?: number; // Only for folders
  fileNamesDis?: string; // Display of all file names under the folder
}
export interface fileMetadata extends FileMeta {
  type: string;
}

export interface FileRequest {
  type: "fileRequest";
  fileId: string;
  offset?: number; // Optional: byte offset to resume from
}

export interface StringMetadata {
  type: "stringMetadata";
  length: number;
}

export interface StringChunk {
  type: "string";
  chunk: string;
  index: number;
  total: number;
}

// 接收端主导的完成确认消息
export interface FileReceiveComplete {
  type: "fileReceiveComplete";
  fileId: string;
  receivedSize: number;
  receivedChunks: number;
  storeUpdated: boolean; // 确认Store已更新
}

export interface FolderReceiveComplete {
  type: "folderReceiveComplete";
  folderName: string;
  completedFileIds: string[];
  allStoreUpdated: boolean; // 确认所有文件都已加入Store
}

// 🚀 新增：融合到数据包中的chunk元数据结构
export interface EmbeddedChunkMeta {
  chunkIndex: number; // 数据块序号，从0开始  
  totalChunks: number; // 总数据块数量
  chunkSize: number; // 数据块大小（不包含元数据部分）
  isLastChunk: boolean; // 是否为最后一个数据块
  fileOffset: number; // 在文件中的偏移量
  fileId: string; // 文件ID，用于匹配
}
// 注意：EmbeddedChunkMeta不在WebRTCMessage中，因为它嵌入在二进制数据内

// 🚀 融合数据包的二进制结构:
// [4字节：元数据长度] + [JSON元数据] + [实际chunk数据]
// 所有文件传输统一使用这种格式，彻底解决Firefox乱序问题

export type WebRTCMessage =
  | fileMetadata
  | FileRequest
  | StringMetadata
  | StringChunk
  | FileReceiveComplete
  | FolderReceiveComplete;

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
  progressCallback:
    | ((id: string, progress: number, speed: number) => void)
    | null;
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
  fileMeta: (data: any, peerId: string) => void;
}
