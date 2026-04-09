interface SenderRoomStatusOptions {
  isInRoom: boolean;
  peerCount: number;
  roomEmptyLabel: string;
  onlyOneLabel: string;
  peopleCountLabel: string;
}

interface ReceiverRoomStatusOptions {
  isInRoom: boolean;
  peerCount: number;
  receiverCanAcceptLabel: string;
  onlyOneLabel: string;
  connectedLabel: string;
}

interface SenderShareLinkOptions {
  roomId: string;
  isInRoom: boolean;
  origin: string;
  pathname: string;
}

function formatPeopleCount(
  template: string,
  peerCount: number
): string {
  return template.replace("{peerCount}", peerCount.toString());
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

  return formatPeopleCount(peopleCountLabel, peerCount + 1);
}

export function getReceiverRoomStatusText({
  isInRoom,
  peerCount,
  receiverCanAcceptLabel,
  onlyOneLabel,
  connectedLabel,
}: ReceiverRoomStatusOptions): string {
  if (!isInRoom) {
    return receiverCanAcceptLabel;
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
}: SenderShareLinkOptions): string {
  if (!isInRoom || !roomId) {
    return "";
  }

  return `${origin}${pathname}?roomId=${roomId}`;
}
