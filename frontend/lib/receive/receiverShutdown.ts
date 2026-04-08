// Keep receiver shutdown semantics aligned with the documented shutdown matrix.
import type { ReceptionShutdownLifecycleState } from "./ReceptionStateManager";

export type ReceiverShutdownAction =
  | "peer_disconnect"
  | "leave_room"
  | "force_reset"
  | "cleanup";

export type ReceiverShutdownLifecycleState = ReceptionShutdownLifecycleState;

export interface ReceiverShutdownPolicy {
  action: ReceiverShutdownAction;
  lifecycleState: ReceiverShutdownLifecycleState;
  preserveMetadata: boolean;
  preserveSaveType: boolean;
  preserveSaveDirectory: boolean;
  preservePartialFiles: boolean;
  allowResume: boolean;
  resetProgress: boolean;
  disposeProcessors: boolean;
}

const RECEIVER_SHUTDOWN_POLICIES: Record<
  ReceiverShutdownAction,
  ReceiverShutdownPolicy
> = {
  peer_disconnect: {
    action: "peer_disconnect",
    lifecycleState: "disconnecting",
    preserveMetadata: true,
    preserveSaveType: true,
    preserveSaveDirectory: true,
    preservePartialFiles: true,
    allowResume: true,
    resetProgress: true,
    disposeProcessors: false,
  },
  leave_room: {
    action: "leave_room",
    lifecycleState: "leaving_room",
    preserveMetadata: false,
    preserveSaveType: false,
    preserveSaveDirectory: true,
    preservePartialFiles: true,
    allowResume: false,
    resetProgress: true,
    disposeProcessors: false,
  },
  force_reset: {
    action: "force_reset",
    lifecycleState: "resetting",
    preserveMetadata: false,
    preserveSaveType: false,
    preserveSaveDirectory: true,
    preservePartialFiles: true,
    allowResume: false,
    resetProgress: true,
    disposeProcessors: false,
  },
  cleanup: {
    action: "cleanup",
    lifecycleState: "cleaning_up",
    preserveMetadata: false,
    preserveSaveType: false,
    preserveSaveDirectory: true,
    preservePartialFiles: true,
    allowResume: false,
    resetProgress: true,
    disposeProcessors: true,
  },
};

export function getReceiverShutdownPolicy(
  action: ReceiverShutdownAction
): ReceiverShutdownPolicy {
  return RECEIVER_SHUTDOWN_POLICIES[action];
}
