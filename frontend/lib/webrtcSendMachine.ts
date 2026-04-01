import { BroadcastResult, SendResult } from "@/types/webrtc";

export interface SendToPeerMachineOptions {
  peerId: string;
  isGracefullyDisconnected: () => boolean;
  trySend: (attemptNumber: number) => SendResult | null;
  getFinalState: () => SendResult["finalState"];
  delay: (ms: number) => Promise<void>;
  onChannelNotReady?: () => void;
  onRetry?: (attemptNumber: number, maxRetryAttempts: number) => void;
  onFailure?: (failureResult: SendResult) => void;
  maxRetryAttempts?: number;
  initialRetryDelayMs?: number;
  subsequentRetryDelayMs?: number;
}

export function buildSendResult(
  ok: boolean,
  peerId: string,
  attempts: number,
  finalState: SendResult["finalState"],
  reason?: string
): SendResult {
  return {
    ok,
    peerId,
    attempts,
    finalState,
    reason,
  };
}

export function buildBroadcastResult(results: SendResult[]): BroadcastResult {
  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

function buildGracefulDisconnectResult(
  peerId: string,
  attempts: number
): SendResult {
  return buildSendResult(
    false,
    peerId,
    attempts,
    "gracefully_disconnected",
    "peer_gracefully_disconnected"
  );
}

export async function sendToPeerWithRetry(
  options: SendToPeerMachineOptions
): Promise<SendResult> {
  const {
    peerId,
    isGracefullyDisconnected,
    trySend,
    getFinalState,
    delay,
    onChannelNotReady,
    onRetry,
    onFailure,
    maxRetryAttempts = 6,
    initialRetryDelayMs = 100,
    subsequentRetryDelayMs = 1000,
  } = options;

  if (isGracefullyDisconnected()) {
    return buildGracefulDisconnectResult(peerId, 0);
  }

  const immediateResult = trySend(1);
  if (immediateResult) {
    return immediateResult;
  }

  onChannelNotReady?.();

  for (let retryIndex = 0; retryIndex < maxRetryAttempts; retryIndex++) {
    const attemptNumber = retryIndex + 2;
    const delayMs =
      retryIndex === 0 ? initialRetryDelayMs : subsequentRetryDelayMs;

    await delay(delayMs);

    if (isGracefullyDisconnected()) {
      return buildGracefulDisconnectResult(peerId, attemptNumber);
    }

    const retryResult = trySend(attemptNumber);
    if (retryResult) {
      return retryResult;
    }

    onRetry?.(attemptNumber, maxRetryAttempts);
  }

  const failureResult = buildSendResult(
    false,
    peerId,
    maxRetryAttempts + 1,
    getFinalState(),
    "data_channel_not_ready"
  );

  onFailure?.(failureResult);
  return failureResult;
}
