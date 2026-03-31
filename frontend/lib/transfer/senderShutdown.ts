export type SenderShutdownAction = "leave_room" | "reset_app" | "cleanup";

export interface SenderShutdownPolicy {
  action: SenderShutdownAction;
  keepSocketAlive: boolean;
  clearTransferState: boolean;
}

const SENDER_SHUTDOWN_POLICIES: Record<
  SenderShutdownAction,
  SenderShutdownPolicy
> = {
  leave_room: {
    action: "leave_room",
    keepSocketAlive: true,
    clearTransferState: true,
  },
  reset_app: {
    action: "reset_app",
    keepSocketAlive: true,
    clearTransferState: true,
  },
  cleanup: {
    action: "cleanup",
    keepSocketAlive: false,
    clearTransferState: true,
  },
};

export function getSenderShutdownPolicy(
  action: SenderShutdownAction
): SenderShutdownPolicy {
  return SENDER_SHUTDOWN_POLICIES[action];
}
