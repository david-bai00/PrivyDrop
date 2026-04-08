import { describe, expect, it, vi } from "vitest";

import {
  cleanupPeerCollection,
  mapPeerCollection,
  snapshotPeerIds,
} from "@/lib/webrtcConnectionCollection";

describe("snapshotPeerIds", () => {
  it("returns all peer ids from a map", () => {
    const collection = new Map([
      ["peer-a", {}],
      ["peer-b", {}],
    ]);

    expect(snapshotPeerIds(collection)).toEqual(["peer-a", "peer-b"]);
  });
});

describe("mapPeerCollection", () => {
  it("returns an empty result for an empty map", async () => {
    const collection = new Map<string, object>();
    const mapper = vi.fn();

    const results = await mapPeerCollection(collection, mapper);

    expect(results).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it("maps every peer exactly once even if the source map mutates", async () => {
    const collection = new Map([
      ["peer-a", {}],
      ["peer-b", {}],
      ["peer-c", {}],
    ]);
    const visited: string[] = [];

    const results = await mapPeerCollection(collection, async (peerId) => {
      visited.push(peerId);
      collection.delete(peerId);
      return `${peerId}:ok`;
    });

    expect(visited).toEqual(["peer-a", "peer-b", "peer-c"]);
    expect(results).toEqual(["peer-a:ok", "peer-b:ok", "peer-c:ok"]);
    expect(collection.size).toBe(0);
  });
});

describe("cleanupPeerCollection", () => {
  it("is a no-op for an empty map", async () => {
    const collection = new Map<string, object>();
    const cleanup = vi.fn();

    await cleanupPeerCollection(collection, cleanup);

    expect(cleanup).not.toHaveBeenCalled();
  });

  it("cleans every peer exactly once from a snapshot", async () => {
    const collection = new Map([
      ["peer-a", {}],
      ["peer-b", {}],
      ["peer-c", {}],
    ]);
    const cleanup = vi.fn(async (peerId: string) => {
      collection.delete(peerId);
    });

    await cleanupPeerCollection(collection, cleanup);

    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(cleanup.mock.calls.map(([peerId]) => peerId)).toEqual([
      "peer-a",
      "peer-b",
      "peer-c",
    ]);
    expect(collection.size).toBe(0);
  });
});
