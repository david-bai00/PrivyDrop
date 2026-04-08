import type {
  ReceptionReadyLifecycleState,
  ReceptionLifecycleState,
  ReceptionShutdownLifecycleState,
} from "./ReceptionStateManager";

export interface ReceptionResetOptions {
  preserveMetadata?: boolean;
  preserveSaveType?: boolean;
  preserveSaveDirectory?: boolean;
  nextLifecycleState?: ReceptionReadyLifecycleState;
}

export interface ReceptionResetPlan {
  clearMetadata: boolean;
  clearSaveType: boolean;
  clearSaveDirectory: boolean;
  clearActiveReceptionState: boolean;
  clearCurrentContext: boolean;
  nextLifecycleState: ReceptionLifecycleState;
}

export type ReceptionLifecycleEvent =
  | { type: "begin_preparing" }
  | { type: "request_dispatched" }
  | { type: "chunk_received" }
  | { type: "begin_finalizing" }
  | { type: "complete_file_reception" }
  | { type: "interrupt_file_reception" }
  | { type: "fail_file_reception" }
  | {
      type: "enter_shutdown";
      nextState: ReceptionShutdownLifecycleState;
    }
  | {
      type: "finish_reset";
      nextState?: ReceptionReadyLifecycleState;
    };

export function canStartReception(
  lifecycleState: ReceptionLifecycleState
): boolean {
  return (
    lifecycleState === "idle" ||
    lifecycleState === "completed" ||
    lifecycleState === "interrupted" ||
    lifecycleState === "failed"
  );
}

export function isTransitioningReceptionLifecycle(
  lifecycleState: ReceptionLifecycleState
): boolean {
  return (
    lifecycleState === "disconnecting" ||
    lifecycleState === "leaving_room" ||
    lifecycleState === "resetting" ||
    lifecycleState === "cleaning_up"
  );
}

export function resolveReceptionLifecycleState(
  lifecycleState: ReceptionLifecycleState,
  event: ReceptionLifecycleEvent
): ReceptionLifecycleState {
  switch (event.type) {
    case "begin_preparing":
      if (!canStartReception(lifecycleState)) {
        throw new Error(
          `Cannot start file reception while receiver is ${lifecycleState}`
        );
      }
      return "preparing";
    case "request_dispatched":
      if (lifecycleState !== "preparing") {
        throw new Error(
          `Cannot dispatch file request while receiver is ${lifecycleState}`
        );
      }
      return "requesting";
    case "chunk_received":
      if (
        lifecycleState !== "preparing" &&
        lifecycleState !== "requesting" &&
        lifecycleState !== "receiving"
      ) {
        throw new Error(
          `Cannot mark chunk reception while receiver is ${lifecycleState}`
        );
      }
      return "receiving";
    case "begin_finalizing":
      if (
        lifecycleState !== "preparing" &&
        lifecycleState !== "requesting" &&
        lifecycleState !== "receiving"
      ) {
        throw new Error(
          `Cannot finalize file reception while receiver is ${lifecycleState}`
        );
      }
      return "finalizing";
    case "complete_file_reception":
      if (lifecycleState !== "finalizing") {
        throw new Error(
          `Cannot complete file reception while receiver is ${lifecycleState}`
        );
      }
      return "completed";
    case "interrupt_file_reception":
      if (
        lifecycleState !== "preparing" &&
        lifecycleState !== "requesting" &&
        lifecycleState !== "receiving" &&
        lifecycleState !== "finalizing"
      ) {
        throw new Error(
          `Cannot interrupt file reception while receiver is ${lifecycleState}`
        );
      }
      return "interrupted";
    case "fail_file_reception":
      if (
        lifecycleState !== "preparing" &&
        lifecycleState !== "requesting" &&
        lifecycleState !== "receiving" &&
        lifecycleState !== "finalizing"
      ) {
        throw new Error(
          `Cannot fail file reception while receiver is ${lifecycleState}`
        );
      }
      return "failed";
    case "enter_shutdown":
      return event.nextState;
    case "finish_reset":
      return event.nextState ?? "idle";
  }
}

export function buildReceptionResetPlan(
  options?: ReceptionResetOptions
): ReceptionResetPlan {
  const {
    preserveMetadata = false,
    preserveSaveType = false,
    preserveSaveDirectory = true,
  } = options ?? {};

  return {
    clearMetadata: !preserveMetadata,
    clearSaveType: !preserveSaveType,
    clearSaveDirectory: !preserveSaveDirectory,
    clearActiveReceptionState: true,
    clearCurrentContext: true,
    nextLifecycleState: options?.nextLifecycleState ?? "idle",
  };
}
