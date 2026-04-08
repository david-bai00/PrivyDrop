import type {
  ReceptionLifecycleState,
  ReceptionShutdownLifecycleState,
} from "./ReceptionStateManager";

export interface ReceptionResetOptions {
  preserveMetadata?: boolean;
  preserveSaveType?: boolean;
  preserveSaveDirectory?: boolean;
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
  | { type: "start_file_reception" }
  | { type: "complete_file_reception" }
  | { type: "fail_file_reception" }
  | {
      type: "enter_shutdown";
      nextState: ReceptionShutdownLifecycleState;
    }
  | { type: "transition_complete" };

export function canStartReception(
  lifecycleState: ReceptionLifecycleState
): boolean {
  return lifecycleState === "idle";
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
    case "start_file_reception":
      if (!canStartReception(lifecycleState)) {
        throw new Error(
          `Cannot start file reception while receiver is ${lifecycleState}`
        );
      }
      return "receiving";
    case "complete_file_reception":
    case "fail_file_reception":
    case "transition_complete":
      return "idle";
    case "enter_shutdown":
      return event.nextState;
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
    nextLifecycleState: "idle",
  };
}
