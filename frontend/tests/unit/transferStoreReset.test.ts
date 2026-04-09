import { describe, expect, it } from "vitest";

import {
  getReceiverStoreResetPolicy,
  getSenderStoreResetPolicy,
  hasActiveTransferProgress,
} from "@/stores/transferStoreReset";

describe("store reset policies", () => {
  it("keeps sender reset behavior scoped to sender state", () => {
    expect(getSenderStoreResetPolicy("leave_room")).toEqual({
      action: "leave_room",
      clearShareLink: true,
      clearShareRoomStatusText: true,
      clearSendProgress: true,
      clearSenderDraftPayload: false,
      clearSenderPublishedPayload: false,
    });

    expect(getSenderStoreResetPolicy("reset_app")).toEqual({
      action: "reset_app",
      clearShareLink: true,
      clearShareRoomStatusText: true,
      clearSendProgress: true,
      clearSenderDraftPayload: false,
      clearSenderPublishedPayload: false,
    });

    expect(getSenderStoreResetPolicy("cleanup")).toEqual({
      action: "cleanup",
      clearShareLink: true,
      clearShareRoomStatusText: true,
      clearSendProgress: true,
      clearSenderDraftPayload: true,
      clearSenderPublishedPayload: true,
    });
  });

  it("clears receiver room state for leave and cleanup", () => {
    expect(getReceiverStoreResetPolicy("leave_room")).toEqual({
      action: "leave_room",
      clearRetrievedContent: true,
      clearRetrievedFiles: true,
      clearRetrievedFileMetas: true,
      clearRetrieveRoomStatusText: true,
      clearReceiveProgress: true,
      clearSenderDisconnected: true,
    });

    expect(getReceiverStoreResetPolicy("cleanup")).toEqual({
      action: "cleanup",
      clearRetrievedContent: true,
      clearRetrievedFiles: true,
      clearRetrievedFileMetas: true,
      clearRetrieveRoomStatusText: true,
      clearReceiveProgress: true,
      clearSenderDisconnected: true,
    });
  });
});

describe("hasActiveTransferProgress", () => {
  it("returns true when any send or receive progress is in flight", () => {
    expect(
      hasActiveTransferProgress(
        {
          fileA: {
            peer1: { progress: 0.4, speed: 128 },
          },
        },
        {}
      )
    ).toBe(true);

    expect(
      hasActiveTransferProgress(
        {},
        {
          fileB: {
            peer2: { progress: 0.6, speed: 256 },
          },
        }
      )
    ).toBe(true);
  });

  it("ignores empty, not started, and fully completed progress groups", () => {
    expect(
      hasActiveTransferProgress(
        {
          fileA: {
            peer1: { progress: 0, speed: 0 },
            peer2: { progress: 1, speed: 0 },
          },
        },
        {}
      )
    ).toBe(false);

    expect(hasActiveTransferProgress({}, {})).toBe(false);
  });
});
