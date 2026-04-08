import { describe, expect, it } from "vitest";

import {
  buildReceptionResetPlan,
  canStartReception,
  isTransitioningReceptionLifecycle,
  resolveReceptionLifecycleState,
} from "@/lib/receive/receptionStateMachine";

describe("resolveReceptionLifecycleState", () => {
  it("starts file reception from idle", () => {
    expect(
      resolveReceptionLifecycleState("idle", { type: "start_file_reception" })
    ).toBe("receiving");
  });

  it("returns idle after reception completes or fails", () => {
    expect(
      resolveReceptionLifecycleState("receiving", {
        type: "complete_file_reception",
      })
    ).toBe("idle");
    expect(
      resolveReceptionLifecycleState("receiving", {
        type: "fail_file_reception",
      })
    ).toBe("idle");
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

  it("rejects starting a new reception during a non-idle lifecycle state", () => {
    expect(() =>
      resolveReceptionLifecycleState("disconnecting", {
        type: "start_file_reception",
      })
    ).toThrow("Cannot start file reception while receiver is disconnecting");
  });
});

describe("canStartReception", () => {
  it("only allows starts from idle", () => {
    expect(canStartReception("idle")).toBe(true);
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
      })
    ).toEqual({
      clearMetadata: false,
      clearSaveType: false,
      clearSaveDirectory: false,
      clearActiveReceptionState: true,
      clearCurrentContext: true,
      nextLifecycleState: "idle",
    });
  });
});
