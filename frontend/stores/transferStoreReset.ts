// Keep store reset boundaries aligned with the documented shutdown matrix.
export type PeerProgress = { progress: number; speed: number };
export type TransferProgressState = Record<string, Record<string, PeerProgress>>;

export type SenderStoreResetAction = "leave_room" | "reset_app" | "cleanup";
export type ReceiverStoreResetAction = "leave_room" | "cleanup";

export interface SenderStoreResetPolicy {
  action: SenderStoreResetAction;
  clearShareLink: boolean;
  clearShareRoomStatusText: boolean;
  clearSendProgress: boolean;
  clearSenderDraftPayload: boolean;
  clearSenderPublishedPayload: boolean;
}

export interface ReceiverStoreResetPolicy {
  action: ReceiverStoreResetAction;
  clearRetrievedContent: boolean;
  clearRetrievedFiles: boolean;
  clearRetrievedFileMetas: boolean;
  clearRetrieveRoomStatusText: boolean;
  clearReceiveProgress: boolean;
  clearSenderDisconnected: boolean;
}

const SENDER_STORE_RESET_POLICIES: Record<
  SenderStoreResetAction,
  SenderStoreResetPolicy
> = {
  leave_room: {
    action: "leave_room",
    clearShareLink: true,
    clearShareRoomStatusText: true,
    clearSendProgress: true,
    clearSenderDraftPayload: false,
    clearSenderPublishedPayload: false,
  },
  reset_app: {
    action: "reset_app",
    clearShareLink: true,
    clearShareRoomStatusText: true,
    clearSendProgress: true,
    clearSenderDraftPayload: false,
    clearSenderPublishedPayload: false,
  },
  cleanup: {
    action: "cleanup",
    clearShareLink: true,
    clearShareRoomStatusText: true,
    clearSendProgress: true,
    clearSenderDraftPayload: true,
    clearSenderPublishedPayload: true,
  },
};

const RECEIVER_STORE_RESET_POLICIES: Record<
  ReceiverStoreResetAction,
  ReceiverStoreResetPolicy
> = {
  leave_room: {
    action: "leave_room",
    clearRetrievedContent: true,
    clearRetrievedFiles: true,
    clearRetrievedFileMetas: true,
    clearRetrieveRoomStatusText: true,
    clearReceiveProgress: true,
    clearSenderDisconnected: true,
  },
  cleanup: {
    action: "cleanup",
    clearRetrievedContent: true,
    clearRetrievedFiles: true,
    clearRetrievedFileMetas: true,
    clearRetrieveRoomStatusText: true,
    clearReceiveProgress: true,
    clearSenderDisconnected: true,
  },
};

export function getSenderStoreResetPolicy(
  action: SenderStoreResetAction
): SenderStoreResetPolicy {
  return SENDER_STORE_RESET_POLICIES[action];
}

export function getReceiverStoreResetPolicy(
  action: ReceiverStoreResetAction
): ReceiverStoreResetPolicy {
  return RECEIVER_STORE_RESET_POLICIES[action];
}

export function hasActiveTransferProgress(
  sendProgress: TransferProgressState,
  receiveProgress: TransferProgressState
): boolean {
  const progressGroups = [
    ...Object.values(sendProgress),
    ...Object.values(receiveProgress),
  ];

  return progressGroups.some((fileProgress) =>
    Object.values(fileProgress).some(
      (progress) => progress.progress > 0 && progress.progress < 1
    )
  );
}
