import { describe, expect, it } from "vitest";

import {
  buildReceptionResetPlan,
  canStartReception,
  isTransitioningReceptionLifecycle,
  resolveReceptionLifecycleState,
} from "@/lib/receive/receptionStateMachine";

describe("resolveReceptionLifecycleState", () => {
  it("starts file reception from any ready state", () => {
    expect(
      resolveReceptionLifecycleState("idle", { type: "begin_preparing" })
    ).toBe("preparing");
    expect(
      resolveReceptionLifecycleState("completed", { type: "begin_preparing" })
    ).toBe("preparing");
    expect(
      resolveReceptionLifecycleState("interrupted", {
        type: "begin_preparing",
      })
    ).toBe("preparing");
    expect(
      resolveReceptionLifecycleState("failed", { type: "begin_preparing" })
    ).toBe("preparing");
  });

  it("advances through request, receive, finalize, and complete states", () => {
    expect(
      resolveReceptionLifecycleState("preparing", {
        type: "request_dispatched",
      })
    ).toBe("requesting");
    expect(
      resolveReceptionLifecycleState("requesting", {
        type: "chunk_received",
      })
    ).toBe("receiving");
    expect(
      resolveReceptionLifecycleState("receiving", {
        type: "begin_finalizing",
      })
    ).toBe("finalizing");
    expect(
      resolveReceptionLifecycleState("finalizing", {
        type: "complete_file_reception",
      })
    ).toBe("completed");
  });

  it("marks interrupted and failed as explicit terminal states", () => {
    expect(
      resolveReceptionLifecycleState("requesting", {
        type: "interrupt_file_reception",
      })
    ).toBe("interrupted");
    expect(
      resolveReceptionLifecycleState("finalizing", {
        type: "fail_file_reception",
      })
    ).toBe("failed");
  });

  it("enters explicit shutdown lifecycle states", () => {
    expect(
      resolveReceptionLifecycleState("receiving", {
        type: "enter_shutdown",
        nextState: "disconnecting",
      })
    ).toBe("disconnecting");
    expect(
      resolveReceptionLifecycleState("receiving", {
        type: "enter_shutdown",
        nextState: "leaving_room",
      })
    ).toBe("leaving_room");
    expect(
      resolveReceptionLifecycleState("receiving", {
        type: "enter_shutdown",
        nextState: "resetting",
      })
    ).toBe("resetting");
    expect(
      resolveReceptionLifecycleState("receiving", {
        type: "enter_shutdown",
        nextState: "cleaning_up",
      })
    ).toBe("cleaning_up");
  });

  it("returns a configurable ready state after reset", () => {
    expect(
      resolveReceptionLifecycleState("resetting", {
        type: "finish_reset",
      })
    ).toBe("idle");
    expect(
      resolveReceptionLifecycleState("disconnecting", {
        type: "finish_reset",
        nextState: "interrupted",
      })
    ).toBe("interrupted");
  });

  it("rejects invalid transitions with explicit errors", () => {
    expect(() =>
      resolveReceptionLifecycleState("disconnecting", {
        type: "begin_preparing",
      })
    ).toThrow("Cannot start file reception while receiver is disconnecting");
    expect(() =>
      resolveReceptionLifecycleState("idle", {
        type: "request_dispatched",
      })
    ).toThrow("Cannot dispatch file request while receiver is idle");
    expect(() =>
      resolveReceptionLifecycleState("completed", {
        type: "complete_file_reception",
      })
    ).toThrow("Cannot complete file reception while receiver is completed");
  });
});

describe("canStartReception", () => {
  it("only allows starts from ready states", () => {
    expect(canStartReception("idle")).toBe(true);
    expect(canStartReception("completed")).toBe(true);
    expect(canStartReception("interrupted")).toBe(true);
    expect(canStartReception("failed")).toBe(true);
    expect(canStartReception("preparing")).toBe(false);
    expect(canStartReception("requesting")).toBe(false);
    expect(canStartReception("receiving")).toBe(false);
    expect(canStartReception("cleaning_up")).toBe(false);
  });
});

describe("isTransitioningReceptionLifecycle", () => {
  it("marks shutdown lifecycle states as transitioning", () => {
    expect(isTransitioningReceptionLifecycle("disconnecting")).toBe(true);
    expect(isTransitioningReceptionLifecycle("leaving_room")).toBe(true);
    expect(isTransitioningReceptionLifecycle("resetting")).toBe(true);
    expect(isTransitioningReceptionLifecycle("cleaning_up")).toBe(true);
    expect(isTransitioningReceptionLifecycle("receiving")).toBe(false);
  });
});

describe("buildReceptionResetPlan", () => {
  it("uses the current default preservation policy", () => {
    expect(buildReceptionResetPlan()).toEqual({
      clearMetadata: true,
      clearSaveType: true,
      clearSaveDirectory: false,
      clearActiveReceptionState: true,
      clearCurrentContext: true,
      nextLifecycleState: "idle",
    });
  });

  it("preserves metadata, save type, and save directory when requested", () => {
    expect(
      buildReceptionResetPlan({
        preserveMetadata: true,
        preserveSaveType: true,
        preserveSaveDirectory: true,
        nextLifecycleState: "interrupted",
      })
    ).toEqual({
      clearMetadata: false,
      clearSaveType: false,
      clearSaveDirectory: false,
      clearActiveReceptionState: true,
      clearCurrentContext: true,
      nextLifecycleState: "interrupted",
    });
  });
});
