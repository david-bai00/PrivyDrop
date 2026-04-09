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
  senderDraftContent: string;
  senderDraftFiles: CustomFile[];
  senderPublishedContent: string;
  senderPublishedFiles: CustomFile[];
  isSenderPayloadDirty: boolean;
  retrievedContent: string;
  retrievedFiles: CustomFile[];
  retrievedFileMetas: FileMeta[];

  // Transfer progress state
  sendProgress: Record<string, any>;
  receiveProgress: Record<string, any>;
  isAnyFileTransferring: boolean;

  // Actions
  // Room-related actions
  setShareRoomId: (id: string) => void;
  setInitShareRoomId: (id: string) => void;

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
  setSenderDraftContent: (content: string) => void;
  setSenderDraftFiles: (files: CustomFile[]) => void;
  addSenderDraftFiles: (files: CustomFile[]) => void;
  removeSenderDraftFile: (meta: FileMeta) => void;
  publishSenderDraftPayload: () => void;
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
  shareConnectionState: "idle",
  shareLifecycleState: "idle",
  isSenderInRoom: false,
  sharePeerCount: 0,
  retrieveConnectionState: "idle",
  retrieveLifecycleState: "idle",
  isReceiverInRoom: false,
  retrievePeerCount: 0,
  senderDisconnected: false,
  senderDraftContent: "",
  senderDraftFiles: [],
  senderPublishedContent: "",
  senderPublishedFiles: [],
  isSenderPayloadDirty: false,
  retrievedContent: "",
  retrievedFiles: [],
  retrievedFileMetas: [],
  sendProgress: {},
  receiveProgress: {},
  isAnyFileTransferring: false,

  // Actions implementation
  setShareRoomId: (id) => set({ shareRoomId: id }),
  setInitShareRoomId: (id) => set({ initShareRoomId: id }),

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

  setSenderDraftContent: (content) =>
    set((state) => {
      const nextDraftContent = content;

      return {
        senderDraftContent: nextDraftContent,
        isSenderPayloadDirty: hasDirtySenderPayload(
          nextDraftContent,
          state.senderDraftFiles,
          state.senderPublishedContent,
          state.senderPublishedFiles
        ),
      };
    }),
  setSenderDraftFiles: (files) =>
    set((state) => {
      const nextDraftFiles = files;

      return {
        senderDraftFiles: nextDraftFiles,
        isSenderPayloadDirty: hasDirtySenderPayload(
          state.senderDraftContent,
          nextDraftFiles,
          state.senderPublishedContent,
          state.senderPublishedFiles
        ),
      };
    }),
  addSenderDraftFiles: (files) =>
    set((state) => {
      const nextDraftFiles = [...state.senderDraftFiles, ...files];

      return {
        senderDraftFiles: nextDraftFiles,
        isSenderPayloadDirty: hasDirtySenderPayload(
          state.senderDraftContent,
          nextDraftFiles,
          state.senderPublishedContent,
          state.senderPublishedFiles
        ),
      };
    }),
  removeSenderDraftFile: (meta) =>
    set((state) => {
      const nextDraftFiles =
        meta.folderName && meta.folderName !== ""
          ? state.senderDraftFiles.filter(
              (file) => file.folderName !== meta.folderName
            )
          : state.senderDraftFiles.filter(
              (file) => generateFileId(file) !== meta.fileId
            );

      return {
        senderDraftFiles: nextDraftFiles,
        isSenderPayloadDirty: hasDirtySenderPayload(
          state.senderDraftContent,
          nextDraftFiles,
          state.senderPublishedContent,
          state.senderPublishedFiles
        ),
      };
    }),
  publishSenderDraftPayload: () =>
    set((state) => ({
      senderPublishedContent: state.senderDraftContent,
      senderPublishedFiles: state.senderDraftFiles,
      isSenderPayloadDirty: false,
    })),
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
      const nextSenderDraftContent = policy.clearSenderDraftPayload
        ? ""
        : state.senderDraftContent;
      const nextSenderDraftFiles = policy.clearSenderDraftPayload
        ? []
        : state.senderDraftFiles;
      const nextSenderPublishedContent = policy.clearSenderPublishedPayload
        ? ""
        : state.senderPublishedContent;
      const nextSenderPublishedFiles = policy.clearSenderPublishedPayload
        ? []
        : state.senderPublishedFiles;

      return {
        senderDraftContent: nextSenderDraftContent,
        senderDraftFiles: nextSenderDraftFiles,
        senderPublishedContent: nextSenderPublishedContent,
        senderPublishedFiles: nextSenderPublishedFiles,
        isSenderPayloadDirty: hasDirtySenderPayload(
          nextSenderDraftContent,
          nextSenderDraftFiles,
          nextSenderPublishedContent,
          nextSenderPublishedFiles
        ),
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

function hasDirtySenderPayload(
  draftContent: string,
  draftFiles: CustomFile[],
  publishedContent: string,
  publishedFiles: CustomFile[]
): boolean {
  if (draftContent !== publishedContent) {
    return true;
  }

  if (draftFiles.length !== publishedFiles.length) {
    return true;
  }

  return draftFiles.some((file, index) => {
    const publishedFile = publishedFiles[index];

    return (
      !publishedFile || generateFileId(file) !== generateFileId(publishedFile)
    );
  });
}
