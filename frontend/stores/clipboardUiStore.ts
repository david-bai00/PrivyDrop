import { create } from "zustand";

export type ClipboardTab = "send" | "retrieve";

interface ClipboardUiState {
  activeTab: ClipboardTab;
  retrieveRoomIdInput: string;
  isDragging: boolean;
  setActiveTab: (tab: ClipboardTab) => void;
  setRetrieveRoomIdInput: (input: string) => void;
  setIsDragging: (dragging: boolean) => void;
}

export const useClipboardUiStore = create<ClipboardUiState>()((set) => ({
  activeTab: "send",
  retrieveRoomIdInput: "",
  isDragging: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setRetrieveRoomIdInput: (input) => set({ retrieveRoomIdInput: input }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),
}));
