import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StreamingFileReader } from "@/lib/transfer/StreamingFileReader";
import { TransferConfig } from "@/lib/transfer/TransferConfig";

class MockFileReader {
  public result: ArrayBuffer | null = null;
  public error: Error | null = null;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onload?.();
      })
      .catch((error) => {
        this.error = error instanceof Error ? error : new Error(String(error));
        this.onerror?.();
      });
  }

  abort() {
    this.error = new Error("aborted");
  }
}

function createTestFile(size: number) {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    bytes[index] = index % 251;
  }

  return new File([bytes], "reader.bin", {
    type: "application/octet-stream",
    lastModified: 42,
  });
}

describe("StreamingFileReader", () => {
  const originalFileReader = globalThis.FileReader;

  beforeEach(() => {
    vi.stubGlobal("FileReader", MockFileReader);
  });

  afterEach(() => {
    if (originalFileReader) {
      vi.stubGlobal("FileReader", originalFileReader);
    } else {
      vi.unstubAllGlobals();
    }
  });

  it("reads a file as sequential 64KB network chunks and then returns EOF", async () => {
    const size =
      TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE * 2 + 123;
    const file = createTestFile(size) as any;
    const reader = new StreamingFileReader(file);

    const first = await reader.getNextNetworkChunk();
    const second = await reader.getNextNetworkChunk();
    const third = await reader.getNextNetworkChunk();
    const eof = await reader.getNextNetworkChunk();

    expect(first.chunk?.byteLength).toBe(
      TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE
    );
    expect(first.chunkIndex).toBe(0);
    expect(first.fileOffset).toBe(0);
    expect(first.isLastChunk).toBe(false);

    expect(second.chunk?.byteLength).toBe(
      TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE
    );
    expect(second.chunkIndex).toBe(1);
    expect(second.fileOffset).toBe(
      TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE
    );
    expect(second.isLastChunk).toBe(false);

    expect(third.chunk?.byteLength).toBe(123);
    expect(third.chunkIndex).toBe(2);
    expect(third.fileOffset).toBe(
      TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE * 2
    );
    expect(third.isLastChunk).toBe(true);

    expect(eof.chunk).toBeNull();
    expect(eof.isLastChunk).toBe(true);
    expect(eof.fileOffset).toBe(size);
  });

  it("resumes from the provided offset and resets to a new offset correctly", async () => {
    const chunkSize = TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE;
    const file = createTestFile(chunkSize * 4 + 10) as any;
    const reader = new StreamingFileReader(file, chunkSize + 10);

    const resumed = await reader.getNextNetworkChunk();
    expect(resumed.chunkIndex).toBe(1);
    expect(resumed.fileOffset).toBe(chunkSize + 10);
    expect(resumed.chunk?.byteLength).toBe(chunkSize);

    reader.reset(chunkSize * 3);
    const afterReset = await reader.getNextNetworkChunk();
    expect(afterReset.chunkIndex).toBe(3);
    expect(afterReset.fileOffset).toBe(chunkSize * 3);
    expect(afterReset.chunk?.byteLength).toBe(chunkSize);
  });

  it("loads a new batch after the current batch is exhausted", async () => {
    const chunkSize = TransferConfig.FILE_CONFIG.NETWORK_CHUNK_SIZE;
    const file = createTestFile(chunkSize * 3 + 5) as any;
    const reader = new StreamingFileReader(file);

    (reader as any).BATCH_SIZE = chunkSize * 2;
    (reader as any).CHUNKS_PER_BATCH = 2;

    const first = await reader.getNextNetworkChunk();
    const second = await reader.getNextNetworkChunk();
    const third = await reader.getNextNetworkChunk();
    const debugInfo = reader.getDebugInfo();

    expect(first.chunkIndex).toBe(0);
    expect(second.chunkIndex).toBe(1);
    expect(third.chunkIndex).toBe(2);
    expect(third.fileOffset).toBe(chunkSize * 2);
    expect(third.chunk?.byteLength).toBe(chunkSize);
    expect(debugInfo.batchOffset).toBe(chunkSize * 2);
  });
});
