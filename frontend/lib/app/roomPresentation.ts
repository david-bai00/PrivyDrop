interface SenderRoomStatusOptions {
  isInRoom: boolean;
  peerCount: number;
  roomEmptyLabel: string;
  onlyOneLabel: string;
  peopleCountLabel: (peerCount: number) => string;
}

interface ReceiverRoomStatusOptions {
  isInRoom: boolean;
  peerCount: number;
  senderDisconnected: boolean;
  receiverCanAcceptLabel: string;
  onlyOneLabel: string;
  connectedLabel: string;
  senderDisconnectedLabel: string;
}

interface SenderShareLinkOptions {
  roomId: string;
  isInRoom: boolean;
  origin: string;
  pathname: string;
  /**
   * Acquisition channel of the *sender*. Propagated so the receiver can be
   * credited to the same channel, which is the only way to compare channels by
   * real transfers rather than by page views.
   */
  senderRef?: string;
}

export function getSenderRoomStatusText({
  isInRoom,
  peerCount,
  roomEmptyLabel,
  onlyOneLabel,
  peopleCountLabel,
}: SenderRoomStatusOptions): string {
  if (!isInRoom) {
    return roomEmptyLabel;
  }

  if (peerCount === 0) {
    return onlyOneLabel;
  }

  return peopleCountLabel(peerCount + 1);
}

export function getReceiverRoomStatusText({
  isInRoom,
  peerCount,
  senderDisconnected,
  receiverCanAcceptLabel,
  onlyOneLabel,
  connectedLabel,
  senderDisconnectedLabel,
}: ReceiverRoomStatusOptions): string {
  if (!isInRoom) {
    return receiverCanAcceptLabel;
  }

  if (senderDisconnected) {
    return senderDisconnectedLabel;
  }

  if (peerCount === 0) {
    return onlyOneLabel;
  }

  return connectedLabel;
}

export function buildSenderShareLink({
  roomId,
  isInRoom,
  origin,
  pathname,
  senderRef,
}: SenderShareLinkOptions): string {
  if (!isInRoom || !roomId) {
    return "";
  }

  // The ref goes through encodeURIComponent so a hostile or malformed value can
  // never inject extra query parameters into the invite link.
  const safeRef =
    senderRef && senderRef !== "direct" ? `&ref=${encodeURIComponent(senderRef)}` : "";

  return `${origin}${pathname}?roomId=${encodeURIComponent(roomId)}${safeRef}`;
}
