import { create } from "zustand";
import { CustomFile, FileMeta } from "@/types/webrtc";
import { generateFileId } from "@/lib/fileUtils";
import {
  WebRTCConnectionBadgeState,
  WebRTCLifecycleState,
} from "@/types/webrtcLifecycle";
import {
  SenderStoreResetAction,
  ReceiverStoreResetAction,
  getSenderStoreResetPolicy,
  getReceiverStoreResetPolicy,
  hasActiveTransferProgress,
} from "@/stores/transferStoreReset";

interface FileTransferState {
  // Room-related state
  shareRoomId: string;
  initShareRoomId: string;
  shareLink: string;
  shareRoomStatusText: string;
  retrieveRoomStatusText: string;

  // WebRTC connection state - Sender
  shareConnectionState: WebRTCConnectionBadgeState;
  shareLifecycleState: WebRTCLifecycleState;
  isSenderInRoom: boolean;
  sharePeerCount: number;

  // WebRTC connection state - Receiver
  retrieveConnectionState: WebRTCConnectionBadgeState;
  retrieveLifecycleState: WebRTCLifecycleState;
  isReceiverInRoom: boolean;
  retrievePeerCount: number;
  senderDisconnected: boolean;

  // File transfer state
  shareContent: string;
  sendFiles: CustomFile[];
  retrievedContent: string;
  retrievedFiles: CustomFile[];
  retrievedFileMetas: FileMeta[];

  // Transfer progress state
  sendProgress: Record<string, any>;
  receiveProgress: Record<string, any>;
  isAnyFileTransferring: boolean;

  // UI state
  activeTab: "send" | "retrieve";
  retrieveRoomIdInput: string;
  isDragging: boolean;

  // Message state
  shareMessage: string;
  retrieveMessage: string;

  // Actions
  // Room-related actions
  setShareRoomId: (id: string) => void;
  setInitShareRoomId: (id: string) => void;
  setShareLink: (link: string) => void;
  setShareRoomStatusText: (text: string) => void;
  setRetrieveRoomStatusText: (text: string) => void;

  // WebRTC connection-related actions
  setShareConnectionState: (state: WebRTCConnectionBadgeState) => void;
  setShareLifecycleState: (state: WebRTCLifecycleState) => void;
  setIsSenderInRoom: (isInRoom: boolean) => void;
  setSharePeerCount: (count: number) => void;
  setRetrieveConnectionState: (state: WebRTCConnectionBadgeState) => void;
  setRetrieveLifecycleState: (state: WebRTCLifecycleState) => void;
  setIsReceiverInRoom: (isInRoom: boolean) => void;
  setRetrievePeerCount: (count: number) => void;
  setSenderDisconnected: (disconnected: boolean) => void;

  // File transfer-related actions
  setShareContent: (content: string) => void;
  setSendFiles: (files: CustomFile[]) => void;
  addSendFiles: (files: CustomFile[]) => void;
  removeSendFile: (meta: FileMeta) => void;
  setRetrievedContent: (content: string) => void;
  setRetrievedFiles: (files: CustomFile[]) => void;
  setRetrievedFileMetas: (metas: FileMeta[]) => void;
  addRetrievedFile: (file: CustomFile) => void;

  // Transfer progress-related actions
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

  // UI state-related actions
  setActiveTab: (tab: "send" | "retrieve") => void;
  setRetrieveRoomIdInput: (input: string) => void;
  setIsDragging: (dragging: boolean) => void;

  // Message-related actions
  setShareMessage: (message: string) => void;
  setRetrieveMessage: (message: string) => void;
  setRetrieveRoomId: (input: string) => void;

  // Reset-related actions
  applyReceiverStoreReset: (action: ReceiverStoreResetAction) => void;
  applySenderStoreReset: (action: SenderStoreResetAction) => void;
  resetReceiverState: () => void;
  resetSenderApp: () => void;
}

export const useFileTransferStore = create<FileTransferState>()((set, get) => ({
  // Initial state
  shareRoomId: "",
  initShareRoomId: "",
  shareLink: "",
  shareRoomStatusText: "",
  retrieveRoomStatusText: "",
  shareConnectionState: "idle",
  shareLifecycleState: "idle",
  isSenderInRoom: false,
  sharePeerCount: 0,
  retrieveConnectionState: "idle",
  retrieveLifecycleState: "idle",
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

  // Actions implementation
  setShareRoomId: (id) => set({ shareRoomId: id }),
  setInitShareRoomId: (id) => set({ initShareRoomId: id }),
  setShareLink: (link) => set({ shareLink: link }),
  setShareRoomStatusText: (text) => set({ shareRoomStatusText: text }),
  setRetrieveRoomStatusText: (text) => set({ retrieveRoomStatusText: text }),

  // WebRTC connection-related actions
  setShareConnectionState: (state) => set({ shareConnectionState: state }),
  setShareLifecycleState: (state) => set({ shareLifecycleState: state }),
  setIsSenderInRoom: (isInRoom) => set({ isSenderInRoom: isInRoom }),
  setSharePeerCount: (count) => set({ sharePeerCount: count }),
  setRetrieveConnectionState: (state) =>
    set({ retrieveConnectionState: state }),
  setRetrieveLifecycleState: (state) => set({ retrieveLifecycleState: state }),
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
          sendFiles: state.sendFiles.filter(
            (file) => generateFileId(file) !== meta.fileId
          ),
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

  applyReceiverStoreReset: (action) =>
    set((state) => {
      const policy = getReceiverStoreResetPolicy(action);
      const nextReceiveProgress = policy.clearReceiveProgress
        ? {}
        : state.receiveProgress;

      return {
        retrievedContent: policy.clearRetrievedContent
          ? ""
          : state.retrievedContent,
        retrievedFiles: policy.clearRetrievedFiles ? [] : state.retrievedFiles,
        retrievedFileMetas: policy.clearRetrievedFileMetas
          ? []
          : state.retrievedFileMetas,
        retrievePeerCount: 0,
        senderDisconnected: policy.clearSenderDisconnected
          ? false
          : state.senderDisconnected,
        receiveProgress: nextReceiveProgress,
        retrieveRoomStatusText: policy.clearRetrieveRoomStatusText
          ? ""
          : state.retrieveRoomStatusText,
        isAnyFileTransferring: hasActiveTransferProgress(
          state.sendProgress,
          nextReceiveProgress
        ),
      };
    }),

  applySenderStoreReset: (action) =>
    set((state) => {
      const policy = getSenderStoreResetPolicy(action);
      const nextSendProgress = policy.clearSendProgress ? {} : state.sendProgress;

      return {
        shareLink: policy.clearShareLink ? "" : state.shareLink,
        shareRoomStatusText: policy.clearShareRoomStatusText
          ? ""
          : state.shareRoomStatusText,
        sendProgress: nextSendProgress,
        isAnyFileTransferring: hasActiveTransferProgress(
          nextSendProgress,
          state.receiveProgress
        ),
      };
    }),

  resetReceiverState: () => get().applyReceiverStoreReset("leave_room"),

  resetSenderApp: () =>
    get().applySenderStoreReset("reset_app"),
}));
