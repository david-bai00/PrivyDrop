import { describe, expect, it, vi } from "vitest";
import {
  classifyJoinRoomFailureReason,
  runReceiverAutoJoinWithRetry,
  shouldRetryReceiverAutoJoin,
  type JoinRoomResult,
} from "@/lib/app/receiverAutoJoinRetry";

describe("receiverAutoJoinRetry", () => {
  it("classifies only exact room-not-found errors as retryable not_found", () => {
    expect(classifyJoinRoomFailureReason("Room does not exist")).toBe("not_found");
    expect(classifyJoinRoomFailureReason("Join room timeout")).toBe("timeout");
    expect(classifyJoinRoomFailureReason("Rate limit exceeded. Try again in 1s.")).toBe(
      "rate_limit"
    );
    expect(classifyJoinRoomFailureReason("Socket is already bound to another room")).toBe(
      "other"
    );
  });

  it("retries only for auto URL/cached not-found attempts", () => {
    const base = {
      roomId: "room-a",
      snapshot: {
        activeTab: "retrieve" as const,
        isReceiverInRoom: false,
        retrieveRoomIdInput: "room-a",
        token: 3,
      },
      token: 3,
    };
    const notFound: JoinRoomResult = { ok: false, reason: "not_found" };

    expect(
      shouldRetryReceiverAutoJoin({
        ...base,
        source: "auto:url",
      })
    ).toBe(true);

    expect(
      shouldRetryReceiverAutoJoin({
        ...base,
        source: "auto:cached",
      })
    ).toBe(true);

    expect(
      shouldRetryReceiverAutoJoin({
        ...base,
        source: "manual",
      })
    ).toBe(false);

    expect(
      shouldRetryReceiverAutoJoin({
        ...base,
        source: "auto:url",
        snapshot: {
          ...base.snapshot,
          activeTab: "send",
        },
      })
    ).toBe(false);

    expect(notFound).toEqual({ ok: false, reason: "not_found" });
  });

  it("stops retrying when a later attempt succeeds", async () => {
    const attemptJoin = vi
      .fn<Parameters<typeof runReceiverAutoJoinWithRetry>[0]["attemptJoin"]>()
      .mockResolvedValueOnce({ ok: false, reason: "not_found" })
      .mockResolvedValueOnce({ ok: true });
    const wait = vi.fn(async () => undefined);

    const result = await runReceiverAutoJoinWithRetry({
      source: "auto:url",
      roomId: "room-a",
      token: 1,
      getSnapshot: () => ({
        activeTab: "retrieve",
        isReceiverInRoom: false,
        retrieveRoomIdInput: "room-a",
        token: 1,
      }),
      attemptJoin,
      wait,
    });

    expect(result).toEqual({ ok: true });
    expect(attemptJoin).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("returns the final exhausted not-found failure", async () => {
    const attemptJoin = vi.fn(async () => ({ ok: false, reason: "not_found" } as const));
    const wait = vi.fn(async () => undefined);

    const result = await runReceiverAutoJoinWithRetry({
      source: "auto:cached",
      roomId: "room-a",
      token: 4,
      getSnapshot: () => ({
        activeTab: "retrieve",
        isReceiverInRoom: false,
        retrieveRoomIdInput: "room-a",
        token: 4,
      }),
      attemptJoin,
      wait,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(attemptJoin).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it("cancels pending retries when the token or room context changes", async () => {
    const attemptJoin = vi
      .fn<Parameters<typeof runReceiverAutoJoinWithRetry>[0]["attemptJoin"]>()
      .mockResolvedValue({ ok: false, reason: "not_found" });
    const wait = vi.fn(async () => undefined);

    const result = await runReceiverAutoJoinWithRetry({
      source: "auto:url",
      roomId: "room-a",
      token: 8,
      getSnapshot: () => ({
        activeTab: "retrieve",
        isReceiverInRoom: false,
        retrieveRoomIdInput: "room-b",
        token: 9,
      }),
      attemptJoin,
      wait,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(attemptJoin).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not perform the next join attempt when the context turns stale during backoff", async () => {
    const snapshots = [
      {
        activeTab: "retrieve" as const,
        isReceiverInRoom: false,
        retrieveRoomIdInput: "room-a",
        token: 12,
      },
      {
        activeTab: "retrieve" as const,
        isReceiverInRoom: false,
        retrieveRoomIdInput: "room-b",
        token: 13,
      },
    ];
    let snapshotIndex = 0;
    const attemptJoin = vi
      .fn<Parameters<typeof runReceiverAutoJoinWithRetry>[0]["attemptJoin"]>()
      .mockResolvedValue({ ok: false, reason: "not_found" });
    const wait = vi.fn(async () => {
      snapshotIndex = 1;
    });

    const result = await runReceiverAutoJoinWithRetry({
      source: "auto:url",
      roomId: "room-a",
      token: 12,
      getSnapshot: () => snapshots[snapshotIndex],
      attemptJoin,
      wait,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(attemptJoin).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
