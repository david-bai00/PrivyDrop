import { describe, expect, it } from "vitest";

import { getReceiverShutdownPolicy } from "@/lib/receive/receiverShutdown";

describe("getReceiverShutdownPolicy", () => {
  it("preserves resume metadata for peer disconnect", () => {
    expect(getReceiverShutdownPolicy("peer_disconnect")).toEqual({
      action: "peer_disconnect",
      lifecycleState: "disconnecting",
      preserveMetadata: true,
      preserveSaveType: true,
      preserveSaveDirectory: true,
      preservePartialFiles: true,
      allowResume: true,
      resetProgress: true,
      disposeProcessors: false,
    });
  });

  it("clears room metadata for leave and force reset", () => {
    expect(getReceiverShutdownPolicy("leave_room")).toEqual({
      action: "leave_room",
      lifecycleState: "leaving_room",
      preserveMetadata: false,
      preserveSaveType: false,
      preserveSaveDirectory: true,
      preservePartialFiles: true,
      allowResume: false,
      resetProgress: true,
      disposeProcessors: false,
    });

    expect(getReceiverShutdownPolicy("force_reset")).toEqual({
      action: "force_reset",
      lifecycleState: "resetting",
      preserveMetadata: false,
      preserveSaveType: false,
      preserveSaveDirectory: true,
      preservePartialFiles: true,
      allowResume: false,
      resetProgress: true,
      disposeProcessors: false,
    });
  });

  it("disposes processors during full cleanup", () => {
    expect(getReceiverShutdownPolicy("cleanup")).toEqual({
      action: "cleanup",
      lifecycleState: "cleaning_up",
      preserveMetadata: false,
      preserveSaveType: false,
      preserveSaveDirectory: true,
      preservePartialFiles: true,
      allowResume: false,
      resetProgress: true,
      disposeProcessors: true,
    });
  });
});
