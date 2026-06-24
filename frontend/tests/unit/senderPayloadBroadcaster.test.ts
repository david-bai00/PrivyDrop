import { describe, expect, it, vi } from "vitest";
import type { CustomFile } from "@/types/webrtc";
import { SenderPayloadBroadcaster } from "@/lib/app/SenderPayloadBroadcaster";

function createFile(name: string): CustomFile {
  return {
    name,
    size: 10,
    type: "text/plain",
    lastModified: 1,
  } as CustomFile;
}

describe("SenderPayloadBroadcaster", () => {
  it("fans out concurrently while preserving per-peer send order", async () => {
    const peerIds = ["peer-a", "peer-b"];
    const startOrder: string[] = [];
    const finishOrder: string[] = [];
    const release: Array<() => void> = [];

    const broadcaster = new SenderPayloadBroadcaster({
      getPeerIds: () => peerIds,
      hasPeer: (peerId) => peerIds.includes(peerId),
      sendPayloadSnapshot: vi.fn(async (_content, _files, peerId) => {
        startOrder.push(`snapshot:${peerId}`);
        await new Promise<void>((resolve) => release.push(resolve));
        finishOrder.push(`snapshot:${peerId}`);
      }),
      sendString: vi.fn(async (_content, peerId) => {
        startOrder.push(`string:${peerId}`);
        finishOrder.push(`string:${peerId}`);
      }),
      sendFileMeta: vi.fn(async (_files, peerId) => {
        startOrder.push(`file:${peerId}`);
        finishOrder.push(`file:${peerId}`);
      }),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const broadcastPromise = broadcaster.broadcastToAllPeers("hello", [
      createFile("demo.txt"),
    ]);

    expect(startOrder).toEqual(["snapshot:peer-a", "snapshot:peer-b"]);

    release.shift()?.();
    await Promise.resolve();
    release.shift()?.();

    await expect(broadcastPromise).resolves.toBe(true);
    expect(finishOrder).toContain("snapshot:peer-a");
    expect(finishOrder).toContain("snapshot:peer-b");
    expect(finishOrder.indexOf("snapshot:peer-a")).toBeLessThan(
      finishOrder.indexOf("string:peer-a")
    );
    expect(finishOrder.indexOf("string:peer-a")).toBeLessThan(
      finishOrder.indexOf("file:peer-a")
    );
    expect(finishOrder.indexOf("snapshot:peer-b")).toBeLessThan(
      finishOrder.indexOf("string:peer-b")
    );
    expect(finishOrder.indexOf("string:peer-b")).toBeLessThan(
      finishOrder.indexOf("file:peer-b")
    );
  });

  it("still sends a snapshot when content and files are both empty", async () => {
    const sendPayloadSnapshot = vi.fn(async () => undefined);
    const sendString = vi.fn(async () => undefined);
    const sendFileMeta = vi.fn(async () => undefined);

    const broadcaster = new SenderPayloadBroadcaster({
      getPeerIds: () => ["peer-a"],
      hasPeer: () => true,
      sendPayloadSnapshot,
      sendString,
      sendFileMeta,
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await expect(broadcaster.broadcastToAllPeers("", [])).resolves.toBe(true);

    expect(sendPayloadSnapshot).toHaveBeenCalledWith("", [], "peer-a");
    expect(sendString).not.toHaveBeenCalled();
    expect(sendFileMeta).not.toHaveBeenCalled();
  });

  it("preserves the pre-extraction whitespace compatibility contract", async () => {
    const sendPayloadSnapshot = vi.fn(async () => undefined);
    const sendString = vi.fn(async () => undefined);

    const broadcaster = new SenderPayloadBroadcaster({
      getPeerIds: () => ["peer-a"],
      hasPeer: () => true,
      sendPayloadSnapshot,
      sendString,
      sendFileMeta: vi.fn(async () => undefined),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await expect(
      broadcaster.broadcastToPeer("peer-a", "   ", [])
    ).resolves.toBe(true);

    // The broadcaster intentionally preserves the current service contract
    // during extraction, even though payload snapshots compute hasContent
    // differently from direct string sends.
    expect(sendPayloadSnapshot).toHaveBeenCalledWith("   ", [], "peer-a");
    expect(sendString).toHaveBeenCalledWith("   ", "peer-a");
  });

  it("returns false and warns when there are no peers", async () => {
    const warn = vi.fn();

    const broadcaster = new SenderPayloadBroadcaster({
      getPeerIds: () => [],
      hasPeer: () => false,
      sendPayloadSnapshot: vi.fn(async () => undefined),
      sendString: vi.fn(async () => undefined),
      sendFileMeta: vi.fn(async () => undefined),
      logger: {
        warn,
        error: vi.fn(),
      },
    });

    await expect(broadcaster.broadcastToAllPeers("hello", [])).resolves.toBe(
      false
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns false and warns when a target peer is missing", async () => {
    const warn = vi.fn();

    const broadcaster = new SenderPayloadBroadcaster({
      getPeerIds: () => ["peer-a"],
      hasPeer: () => false,
      sendPayloadSnapshot: vi.fn(async () => undefined),
      sendString: vi.fn(async () => undefined),
      sendFileMeta: vi.fn(async () => undefined),
      logger: {
        warn,
        error: vi.fn(),
      },
    });

    await expect(
      broadcaster.broadcastToPeer("peer-a", "hello", [])
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns false and reports broadcaster errors", async () => {
    const error = vi.fn();

    const broadcaster = new SenderPayloadBroadcaster({
      getPeerIds: () => ["peer-a"],
      hasPeer: () => true,
      sendPayloadSnapshot: vi.fn(async () => {
        throw new Error("boom");
      }),
      sendString: vi.fn(async () => undefined),
      sendFileMeta: vi.fn(async () => undefined),
      logger: {
        warn: vi.fn(),
        error,
      },
    });

    await expect(
      broadcaster.broadcastToPeer("peer-a", "hello", [])
    ).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
