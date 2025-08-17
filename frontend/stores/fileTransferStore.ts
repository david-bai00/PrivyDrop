import { create } from "zustand";
import { CustomFile, FileMeta } from "@/types/webrtc";

interface FileTransferState {
  // 房间相关状态
  shareRoomId: string;
  initShareRoomId: string;
  shareLink: string;
  shareRoomStatusText: string;
  retrieveRoomStatusText: string;

  // WebRTC 连接状态 - 发送方
  shareConnectionState:
    | "idle"
    | "connecting"
    | "connected"
    | "disconnected"
    | "failed";
  isSenderInRoom: boolean;
  sharePeerCount: number;

  // WebRTC 连接状态 - 接收方
  retrieveConnectionState:
    | "idle"
    | "connecting"
    | "connected"
    | "disconnected"
    | "failed";
  isReceiverInRoom: boolean;
  retrievePeerCount: number;
  senderDisconnected: boolean;

  // 文件传输状态
  shareContent: string;
  sendFiles: CustomFile[];
  retrievedContent: string;
  retrievedFiles: CustomFile[];
  retrievedFileMetas: FileMeta[];

  // 传输进度状态
  sendProgress: Record<string, any>;
  receiveProgress: Record<string, any>;
  isAnyFileTransferring: boolean;

  // UI 状态
  activeTab: "send" | "retrieve";
  retrieveRoomIdInput: string;
  isDragging: boolean;

  // 消息状态
  shareMessage: string;
  retrieveMessage: string;

  // Actions
  // 房间相关 actions
  setShareRoomId: (id: string) => void;
  setInitShareRoomId: (id: string) => void;
  setShareLink: (link: string) => void;
  setShareRoomStatusText: (text: string) => void;
  setRetrieveRoomStatusText: (text: string) => void;

  // WebRTC 连接相关 actions
  setShareConnectionState: (
    state: "idle" | "connecting" | "connected" | "disconnected" | "failed"
  ) => void;
  setIsSenderInRoom: (isInRoom: boolean) => void;
  setSharePeerCount: (count: number) => void;
  setRetrieveConnectionState: (
    state: "idle" | "connecting" | "connected" | "disconnected" | "failed"
  ) => void;
  setIsReceiverInRoom: (isInRoom: boolean) => void;
  setRetrievePeerCount: (count: number) => void;
  setSenderDisconnected: (disconnected: boolean) => void;

  // 文件传输相关 actions
  setShareContent: (content: string) => void;
  setSendFiles: (files: CustomFile[]) => void;
  addSendFiles: (files: CustomFile[]) => void;
  removeSendFile: (meta: FileMeta) => void;
  setRetrievedContent: (content: string) => void;
  setRetrievedFiles: (files: CustomFile[]) => void;
  setRetrievedFileMetas: (metas: FileMeta[]) => void;
  addRetrievedFile: (file: CustomFile) => void;

  // 传输进度相关 actions
  setSendProgress: (progress: Record<string, any>) => void;
  setReceiveProgress: (progress: Record<string, any>) => void;
  updateSendProgress: (
    fileId: string,
    peerId: string,
    progress: { progress: number; speed: number }
  ) => void;
  updateReceiveProgress: (
    fileId: string,
    peerId: string,
    progress: { progress: number; speed: number }
  ) => void;
  clearSendProgress: (fileId: string, peerId: string) => void;
  clearReceiveProgress: (fileId: string, peerId: string) => void;
  setIsAnyFileTransferring: (transferring: boolean) => void;

  // UI 状态相关 actions
  setActiveTab: (tab: "send" | "retrieve") => void;
  setRetrieveRoomIdInput: (input: string) => void;
  setIsDragging: (dragging: boolean) => void;

  // 消息相关 actions
  setShareMessage: (message: string) => void;
  setRetrieveMessage: (message: string) => void;
  setRetrieveRoomId: (input: string) => void;

  // 重置相关 actions
  resetReceiverState: () => void;
  resetSenderApp: () => void;
}

export const useFileTransferStore = create<FileTransferState>()((set, get) => ({
  // 初始状态
  shareRoomId: "",
  initShareRoomId: "",
  shareLink: "",
  shareRoomStatusText: "",
  retrieveRoomStatusText: "",
  shareConnectionState: "idle",
  isSenderInRoom: false,
  sharePeerCount: 0,
  retrieveConnectionState: "idle",
  isReceiverInRoom: false,
  retrievePeerCount: 0,
  senderDisconnected: false,
  shareContent: "",
  sendFiles: [],
  retrievedContent: "",
  retrievedFiles: [],
  retrievedFileMetas: [],
  sendProgress: {},
  receiveProgress: {},
  isAnyFileTransferring: false,
  activeTab: "send",
  retrieveRoomIdInput: "",
  isDragging: false,
  shareMessage: "",
  retrieveMessage: "",

  // Actions 实现
  setShareRoomId: (id) => set({ shareRoomId: id }),
  setInitShareRoomId: (id) => set({ initShareRoomId: id }),
  setShareLink: (link) => set({ shareLink: link }),
  setShareRoomStatusText: (text) => set({ shareRoomStatusText: text }),
  setRetrieveRoomStatusText: (text) => set({ retrieveRoomStatusText: text }),

  // WebRTC 连接相关 actions
  setShareConnectionState: (state) => set({ shareConnectionState: state }),
  setIsSenderInRoom: (isInRoom) => set({ isSenderInRoom: isInRoom }),
  setSharePeerCount: (count) => set({ sharePeerCount: count }),
  setRetrieveConnectionState: (state) =>
    set({ retrieveConnectionState: state }),
  setIsReceiverInRoom: (isInRoom) => set({ isReceiverInRoom: isInRoom }),
  setRetrievePeerCount: (count) => set({ retrievePeerCount: count }),
  setSenderDisconnected: (disconnected) =>
    set({ senderDisconnected: disconnected }),

  setShareContent: (content) => set({ shareContent: content }),
  setSendFiles: (files) => set({ sendFiles: files }),
  addSendFiles: (files) =>
    set((state) => ({ sendFiles: [...state.sendFiles, ...files] })),
  removeSendFile: (meta) =>
    set((state) => {
      if (meta.folderName && meta.folderName !== "") {
        return {
          sendFiles: state.sendFiles.filter(
            (file) => file.folderName !== meta.folderName
          ),
        };
      } else {
        return {
          sendFiles: state.sendFiles.filter((file) => file.name !== meta.name),
        };
      }
    }),
  setRetrievedContent: (content) => set({ retrievedContent: content }),
  setRetrievedFiles: (files) => set({ retrievedFiles: files }),
  setRetrievedFileMetas: (metas) => set({ retrievedFileMetas: metas }),
  addRetrievedFile: (file) =>
    set((state) => ({ retrievedFiles: [...state.retrievedFiles, file] })),

  setSendProgress: (progress) => set({ sendProgress: progress }),
  setReceiveProgress: (progress) => set({ receiveProgress: progress }),
  updateSendProgress: (fileId, peerId, progress) =>
    set((state) => ({
      sendProgress: {
        ...state.sendProgress,
        [fileId]: { ...state.sendProgress[fileId], [peerId]: progress },
      },
    })),
  updateReceiveProgress: (fileId, peerId, progress) =>
    set((state) => ({
      receiveProgress: {
        ...state.receiveProgress,
        [fileId]: { ...state.receiveProgress[fileId], [peerId]: progress },
      },
    })),
  clearSendProgress: (fileId, peerId) =>
    set((state) => {
      const newSendProgress = { ...state.sendProgress };
      if (newSendProgress[fileId]) {
        const { [peerId]: removed, ...rest } = newSendProgress[fileId];
        if (Object.keys(rest).length === 0) {
          delete newSendProgress[fileId];
        } else {
          newSendProgress[fileId] = rest;
        }
      }
      return { sendProgress: newSendProgress };
    }),
  clearReceiveProgress: (fileId, peerId) =>
    set((state) => {
      const newReceiveProgress = { ...state.receiveProgress };
      if (newReceiveProgress[fileId]) {
        const { [peerId]: removed, ...rest } = newReceiveProgress[fileId];
        if (Object.keys(rest).length === 0) {
          delete newReceiveProgress[fileId];
        } else {
          newReceiveProgress[fileId] = rest;
        }
      }
      return { receiveProgress: newReceiveProgress };
    }),
  setIsAnyFileTransferring: (transferring) =>
    set({ isAnyFileTransferring: transferring }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setRetrieveRoomIdInput: (input) => set({ retrieveRoomIdInput: input }),
  setRetrieveRoomId: (input) => set({ retrieveRoomIdInput: input }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),

  setShareMessage: (message) => set({ shareMessage: message }),
  setRetrieveMessage: (message) => set({ retrieveMessage: message }),

  resetReceiverState: () => {
    // 🔧 清理 FileReceiver 的内部状态（通过 Service 层）
    try {
      const { webrtcService } = require("@/lib/webrtcService");
      webrtcService.fileReceiver.gracefulShutdown();
    } catch (error) {
      console.warn(`[DEBUG] ⚠️ 清理 FileReceiver 状态失败:`, error);
    }

    set({
      retrievedContent: "",
      retrievedFiles: [],
      retrievedFileMetas: [], // 清空 Store 中的文件元数据
      retrievePeerCount: 0,
      senderDisconnected: false,
      receiveProgress: {},
      retrieveRoomStatusText: "",
    });
  },

  resetSenderApp: () =>
    set({
      shareLink: "",
      sendProgress: {},
      receiveProgress: {},
      isAnyFileTransferring: false,
    }),
}));
