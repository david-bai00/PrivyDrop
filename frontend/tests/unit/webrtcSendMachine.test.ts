import { describe, expect, it, vi } from "vitest";

import {
  buildBroadcastResult,
  buildSendResult,
  sendToPeerWithRetry,
} from "@/lib/webrtcSendMachine";

describe("buildBroadcastResult", () => {
  it("returns ok=true for an empty peer set", () => {
    expect(buildBroadcastResult([])).toEqual({
      ok: true,
      results: [],
    });
  });

  it("returns ok=false when any peer send fails", () => {
    const results = [
      buildSendResult(true, "peer-a", 1, "open"),
      buildSendResult(false, "peer-b", 3, "closing", "data_channel_not_ready"),
    ];

    expect(buildBroadcastResult(results)).toEqual({
      ok: false,
      results,
    });
  });
});

describe("sendToPeerWithRetry", () => {
  it("returns the immediate send result when the first attempt succeeds", async () => {
    const trySend = vi.fn().mockReturnValue(
      buildSendResult(true, "peer-a", 1, "open")
    );
    const delay = vi.fn();

    const result = await sendToPeerWithRetry({
      peerId: "peer-a",
      isGracefullyDisconnected: () => false,
      trySend,
      getFinalState: () => "open",
      delay,
    });

    expect(result).toEqual(buildSendResult(true, "peer-a", 1, "open"));
    expect(trySend).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("retries and returns the eventual success result", async () => {
    const trySend = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(buildSendResult(true, "peer-a", 3, "open"));
    const delay = vi.fn().mockResolvedValue(undefined);
    const onChannelNotReady = vi.fn();
    const onRetry = vi.fn();

    const result = await sendToPeerWithRetry({
      peerId: "peer-a",
      isGracefullyDisconnected: () => false,
      trySend,
      getFinalState: () => "connecting",
      delay,
      onChannelNotReady,
      onRetry,
    });

    expect(result).toEqual(buildSendResult(true, "peer-a", 3, "open"));
    expect(trySend).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 100);
    expect(delay).toHaveBeenNthCalledWith(2, 1000);
    expect(onChannelNotReady).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenNthCalledWith(1, 2, 6);
  });

  it("returns a final not-ready failure after exhausting retries", async () => {
    const trySend = vi.fn().mockReturnValue(null);
    const delay = vi.fn().mockResolvedValue(undefined);
    const onFailure = vi.fn();

    const result = await sendToPeerWithRetry({
      peerId: "peer-a",
      isGracefullyDisconnected: () => false,
      trySend,
      getFinalState: () => "closing",
      delay,
      onFailure,
      maxRetryAttempts: 2,
    });

    expect(result).toEqual(
      buildSendResult(false, "peer-a", 3, "closing", "data_channel_not_ready")
    );
    expect(trySend).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 100);
    expect(delay).toHaveBeenNthCalledWith(2, 1000);
    expect(onFailure).toHaveBeenCalledWith(result);
  });

  it("skips send attempts for gracefully disconnected peers", async () => {
    const trySend = vi.fn();
    const delay = vi.fn();

    const result = await sendToPeerWithRetry({
      peerId: "peer-a",
      isGracefullyDisconnected: () => true,
      trySend,
      getFinalState: () => "open",
      delay,
    });

    expect(result).toEqual(
      buildSendResult(
        false,
        "peer-a",
        0,
        "gracefully_disconnected",
        "peer_gracefully_disconnected"
      )
    );
    expect(trySend).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
  });

  it("stops retrying when the peer gracefully disconnects during backoff", async () => {
    const trySend = vi.fn().mockReturnValue(null);
    const delay = vi.fn().mockResolvedValue(undefined);
    let disconnected = false;

    const result = await sendToPeerWithRetry({
      peerId: "peer-a",
      isGracefullyDisconnected: () => disconnected,
      trySend,
      getFinalState: () => "closing",
      delay: async (ms) => {
        await delay(ms);
        disconnected = true;
      },
      maxRetryAttempts: 2,
    });

    expect(result).toEqual(
      buildSendResult(
        false,
        "peer-a",
        2,
        "gracefully_disconnected",
        "peer_gracefully_disconnected"
      )
    );
    expect(trySend).toHaveBeenCalledTimes(1);
    expect(delay).toHaveBeenCalledTimes(1);
  });
});
