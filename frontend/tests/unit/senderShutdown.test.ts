import { describe, expect, it } from "vitest";

import { getSenderShutdownPolicy } from "@/lib/transfer/senderShutdown";

describe("getSenderShutdownPolicy", () => {
  it("keeps the socket alive for room-level exits", () => {
    expect(getSenderShutdownPolicy("leave_room")).toEqual({
      action: "leave_room",
      keepSocketAlive: true,
      clearTransferState: true,
    });

    expect(getSenderShutdownPolicy("reset_app")).toEqual({
      action: "reset_app",
      keepSocketAlive: true,
      clearTransferState: true,
    });
  });

  it("tears down the socket for cleanup", () => {
    expect(getSenderShutdownPolicy("cleanup")).toEqual({
      action: "cleanup",
      keepSocketAlive: false,
      clearTransferState: true,
    });
  });
});
