export type JoinRoomFailureReason =
  | "duplicate"
  | "not_found"
  | "timeout"
  | "rate_limit"
  | "create_room_error"
  | "other";

export type JoinRoomResult =
  | { ok: true }
  | { ok: false; reason: JoinRoomFailureReason };

export type ReceiverAutoJoinSource = "manual" | "auto:url" | "auto:cached";

export const RECEIVER_AUTO_JOIN_RETRY_DELAYS_MS = [200, 400, 800] as const;

export interface ReceiverAutoJoinSnapshot {
  activeTab: "send" | "retrieve";
  isReceiverInRoom: boolean;
  retrieveRoomIdInput: string;
  token: number;
}

interface ShouldRetryReceiverAutoJoinOptions {
  source: ReceiverAutoJoinSource;
  roomId: string;
  snapshot: ReceiverAutoJoinSnapshot;
  token: number;
}

interface RunReceiverAutoJoinWithRetryOptions {
  source: ReceiverAutoJoinSource;
  roomId: string;
  token: number;
  delaysMs?: readonly number[];
  getSnapshot: () => ReceiverAutoJoinSnapshot;
  attemptJoin: (attempt: number, isFinalAttempt: boolean) => Promise<JoinRoomResult>;
  wait?: (ms: number) => Promise<void>;
}

const AUTO_JOIN_SOURCES: ReceiverAutoJoinSource[] = ["auto:url", "auto:cached"];

export function classifyJoinRoomFailureReason(message: string): JoinRoomFailureReason {
  if (message.startsWith("Rate limit exceeded")) {
    return "rate_limit";
  }

  if (message === "Room does not exist") {
    return "not_found";
  }

  if (message === "Join room timeout") {
    return "timeout";
  }

  return "other";
}

export function shouldRetryReceiverAutoJoin({
  source,
  roomId,
  snapshot,
  token,
}: ShouldRetryReceiverAutoJoinOptions): boolean {
  if (!AUTO_JOIN_SOURCES.includes(source)) {
    return false;
  }

  if (snapshot.token !== token) {
    return false;
  }

  if (snapshot.activeTab !== "retrieve") {
    return false;
  }

  if (snapshot.isReceiverInRoom) {
    return false;
  }

  return snapshot.retrieveRoomIdInput.trim() === roomId;
}

export async function runReceiverAutoJoinWithRetry({
  source,
  roomId,
  token,
  delaysMs = RECEIVER_AUTO_JOIN_RETRY_DELAYS_MS,
  getSnapshot,
  attemptJoin,
  wait = (ms) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    }),
}: RunReceiverAutoJoinWithRetryOptions): Promise<JoinRoomResult> {
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    if (
      !shouldRetryReceiverAutoJoin({
        source,
        roomId,
        snapshot: getSnapshot(),
        token,
      })
    ) {
      return { ok: false, reason: "not_found" };
    }

    const isFinalAttempt = attempt === delaysMs.length;
    const result = await attemptJoin(attempt, isFinalAttempt);

    if (result.ok || result.reason !== "not_found" || isFinalAttempt) {
      return result;
    }

    await wait(delaysMs[attempt]);
  }

  return { ok: false, reason: "not_found" };
}
