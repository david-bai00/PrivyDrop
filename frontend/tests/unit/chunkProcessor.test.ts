import { describe, expect, it } from "vitest";

import { ChunkProcessor } from "@/lib/receive/ChunkProcessor";

function buildEmbeddedPacket(meta: any, chunkData: ArrayBuffer): ArrayBuffer {
  const metaJson = JSON.stringify(meta);
  const metaBytes = new TextEncoder().encode(metaJson);

  const metaLengthBuffer = new ArrayBuffer(4);
  const metaLengthView = new Uint32Array(metaLengthBuffer);
  metaLengthView[0] = metaBytes.length;

  const totalLength = 4 + metaBytes.length + chunkData.byteLength;
  const packet = new Uint8Array(totalLength);
  packet.set(new Uint8Array(metaLengthBuffer), 0);
  packet.set(metaBytes, 4);
  packet.set(new Uint8Array(chunkData), 4 + metaBytes.length);
  return packet.buffer;
}

describe("ChunkProcessor.convertToArrayBuffer", () => {
  it("returns ArrayBuffer as-is", async () => {
    const processor = new ChunkProcessor();
    const buffer = new ArrayBuffer(8);
    const result = await processor.convertToArrayBuffer(buffer);
    expect(result).toBe(buffer);
  });

  it("converts Uint8Array to ArrayBuffer", async () => {
    const processor = new ChunkProcessor();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await processor.convertToArrayBuffer(bytes);
    expect(result).not.toBeNull();
    expect(new Uint8Array(result!)).toEqual(bytes);
  });

  it("converts Blob to ArrayBuffer", async () => {
    const processor = new ChunkProcessor();
    const blob = new Blob([new Uint8Array([5, 6, 7])]);
    const result = await processor.convertToArrayBuffer(blob);
    expect(result).not.toBeNull();
    expect(new Uint8Array(result!)).toEqual(new Uint8Array([5, 6, 7]));
  });

  it("returns null for unsupported types", async () => {
    const processor = new ChunkProcessor();
    const result = await processor.convertToArrayBuffer({ not: "binary" });
    expect(result).toBeNull();
  });
});

describe("ChunkProcessor.parseEmbeddedChunkPacket", () => {
  it("parses a valid embedded packet", () => {
    const processor = new ChunkProcessor();
    const chunkData = new Uint8Array([9, 8, 7]).buffer;
    const meta = {
      chunkIndex: 0,
      totalChunks: 1,
      chunkSize: 3,
      isLastChunk: true,
      fileOffset: 0,
      fileId: "file-1",
    };

    const packet = buildEmbeddedPacket(meta, chunkData);
    const parsed = processor.parseEmbeddedChunkPacket(packet);
    expect(parsed).not.toBeNull();
    expect(parsed!.chunkMeta).toEqual(meta);
    expect(new Uint8Array(parsed!.chunkData)).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("returns null for packets shorter than 4 bytes", () => {
    const processor = new ChunkProcessor();
    expect(processor.parseEmbeddedChunkPacket(new ArrayBuffer(3))).toBeNull();
  });

  it("returns null for incomplete packets based on declared meta length", () => {
    const processor = new ChunkProcessor();
    const buffer = new ArrayBuffer(8);
    const lengthView = new Uint32Array(buffer, 0, 1);
    lengthView[0] = 1000;
    expect(processor.parseEmbeddedChunkPacket(buffer)).toBeNull();
  });

  it("returns null when metadata JSON is invalid", () => {
    const processor = new ChunkProcessor();
    const metaBytes = new TextEncoder().encode("{invalid-json");

    const metaLengthBuffer = new ArrayBuffer(4);
    new Uint32Array(metaLengthBuffer)[0] = metaBytes.length;

    const packet = new Uint8Array(4 + metaBytes.length + 1);
    packet.set(new Uint8Array(metaLengthBuffer), 0);
    packet.set(metaBytes, 4);
    packet[4 + metaBytes.length] = 1;

    expect(processor.parseEmbeddedChunkPacket(packet.buffer)).toBeNull();
  });

  it("still parses when chunkSize does not match actual data length", () => {
    const processor = new ChunkProcessor();
    const chunkData = new Uint8Array([1, 2]).buffer;
    const meta = {
      chunkIndex: 0,
      totalChunks: 1,
      chunkSize: 999,
      isLastChunk: true,
      fileOffset: 0,
      fileId: "file-1",
    };

    const packet = buildEmbeddedPacket(meta, chunkData);
    const parsed = processor.parseEmbeddedChunkPacket(packet);
    expect(parsed).not.toBeNull();
    expect(parsed!.chunkMeta.fileId).toBe("file-1");
    expect(parsed!.chunkData.byteLength).toBe(2);
  });
});

describe("ChunkProcessor.validateChunk", () => {
  it("rejects mismatched fileId and invalid size/index", () => {
    const processor = new ChunkProcessor();
    const validation = processor.validateChunk(
      {
        chunkIndex: -1,
        totalChunks: 10,
        chunkSize: 0,
        isLastChunk: false,
        fileOffset: 0,
        fileId: "wrong",
      },
      "expected",
      10,
      0
    );

    expect(validation.isValid).toBe(false);
    expect(validation.errors.join(" | ")).toContain("FileId mismatch");
    expect(validation.errors.join(" | ")).toContain("Invalid chunk size");
    expect(validation.errors.join(" | ")).toContain("Invalid chunk index");
  });
});

describe("ChunkProcessor.processReceivedChunk + isChunkIndexValid", () => {
  it("calculates relative index based on initial offset", () => {
    const processor = new ChunkProcessor();
    const initialOffset = 2 * 65536; // matches ReceptionConfig.CHUNK_SIZE

    const result = processor.processReceivedChunk(
      {
        chunkIndex: 5,
        totalChunks: 10,
        chunkSize: 1,
        isLastChunk: false,
        fileOffset: 0,
        fileId: "file-1",
      },
      new ArrayBuffer(1),
      initialOffset
    );

    expect(result).not.toBeNull();
    expect(result!.absoluteChunkIndex).toBe(5);
    expect(result!.relativeChunkIndex).toBe(3);
    expect(processor.isChunkIndexValid(result!.relativeChunkIndex, 8)).toBe(true);
    expect(processor.isChunkIndexValid(-1, 8)).toBe(false);
    expect(processor.isChunkIndexValid(8, 8)).toBe(false);
  });
});

describe("ChunkProcessor.calculateCompletionStats", () => {
  it("detects missing data and completion", () => {
    const processor = new ChunkProcessor();
    const chunks: (ArrayBuffer | null)[] = [new ArrayBuffer(2), null];

    const incomplete = processor.calculateCompletionStats(chunks, 2, 4);
    expect(incomplete.isSequencedComplete).toBe(false);
    expect(incomplete.sizeComplete).toBe(false);
    expect(incomplete.isDataComplete).toBe(false);

    chunks[1] = new ArrayBuffer(2);
    const complete = processor.calculateCompletionStats(chunks, 2, 4);
    expect(complete.isSequencedComplete).toBe(true);
    expect(complete.sizeComplete).toBe(true);
    expect(complete.isDataComplete).toBe(true);
  });
});

