// Keep receiver shutdown semantics aligned with the documented shutdown matrix.
import type { ReceptionShutdownLifecycleState } from "./ReceptionStateManager";

export type ReceiverShutdownAction =
  | "peer_disconnect"
  | "leave_room"
  | "force_reset"
  | "cleanup";

export type ReceiverShutdownLifecycleState = ReceptionShutdownLifecycleState;

export interface ReceiverShutdownRequest {
  action: ReceiverShutdownAction;
  reason: string;
}

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

const RECEIVER_SHUTDOWN_PRIORITY: Record<ReceiverShutdownAction, number> = {
  peer_disconnect: 0,
  leave_room: 1,
  force_reset: 2,
  cleanup: 3,
};

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

export function mergeReceiverShutdownRequests(
  current: ReceiverShutdownRequest | null,
  next: ReceiverShutdownRequest
): ReceiverShutdownRequest {
  if (!current) {
    return next;
  }

  const currentPriority = RECEIVER_SHUTDOWN_PRIORITY[current.action];
  const nextPriority = RECEIVER_SHUTDOWN_PRIORITY[next.action];

  if (nextPriority > currentPriority) {
    return next;
  }

  if (nextPriority === currentPriority) {
    // Keep the latest reason for better debugging context.
    return { ...current, reason: next.reason };
  }

  return current;
}
