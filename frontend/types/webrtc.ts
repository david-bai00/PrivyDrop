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

// Receiver-initiated completion confirmation message
export interface FileReceiveComplete {
  type: "fileReceiveComplete";
  fileId: string;
  receivedSize: number;
  receivedChunks: number;
  storeUpdated: boolean; // Confirm Store has been updated
}

export interface FolderReceiveComplete {
  type: "folderReceiveComplete";
  folderName: string;
  completedFileIds: string[];
  allStoreUpdated: boolean; // Confirm all files have been added to Store
}

// 🚀 New: Chunk metadata structure embedded in data packets
export interface EmbeddedChunkMeta {
  chunkIndex: number; // Data chunk index, starting from 0  
  totalChunks: number; // Total number of data chunks
  chunkSize: number; // Data chunk size (excluding metadata portion)
  isLastChunk: boolean; // Whether this is the last data chunk
  fileOffset: number; // Offset in the file
  fileId: string; // File ID, used for matching
}
// Note: EmbeddedChunkMeta is not in WebRTCMessage as it is embedded within binary data

// 🚀 Binary structure of fused packets:
// [4 bytes: metadata length] + [JSON metadata] + [actual chunk data]
// All file transfers use this format uniformly to completely solve Firefox out-of-order issues

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
