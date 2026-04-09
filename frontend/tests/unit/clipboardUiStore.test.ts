import { beforeEach, describe, expect, it } from "vitest";

import { useClipboardUiStore } from "@/stores/clipboardUiStore";
import { useFileTransferStore } from "@/stores/fileTransferStore";

describe("clipboardUiStore", () => {
  beforeEach(() => {
    useClipboardUiStore.setState({
      activeTab: "send",
      retrieveRoomIdInput: "",
      isDragging: false,
    });
  });

  it("keeps tab and retrieve input state in the dedicated UI store", () => {
    const state = useClipboardUiStore.getState();

    state.setActiveTab("retrieve");
    state.setRetrieveRoomIdInput("room-123");
    state.setIsDragging(true);

    expect(useClipboardUiStore.getState()).toMatchObject({
      activeTab: "retrieve",
      retrieveRoomIdInput: "room-123",
      isDragging: true,
    });
  });

  it("keeps pure UI state out of the transfer domain store", () => {
    const state = useFileTransferStore.getState() as unknown as Record<
      string,
      unknown
    >;

    expect(state).not.toHaveProperty("activeTab");
    expect(state).not.toHaveProperty("retrieveRoomIdInput");
    expect(state).not.toHaveProperty("isDragging");
    expect(state).not.toHaveProperty("shareMessage");
    expect(state).not.toHaveProperty("retrieveMessage");
  });
});
