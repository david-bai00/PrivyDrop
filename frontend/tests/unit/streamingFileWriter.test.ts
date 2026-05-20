import { describe, expect, it } from "vitest";

import {
  SequencedDiskWriter,
  StreamingFileWriter,
} from "@/lib/receive/StreamingFileWriter";

function textToBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function createMockWritableStream(options: { writeDelayMs?: number } = {}) {
  const bytes: number[] = [];
  const operations: Array<{ type: string; value?: number }> = [];
  let position = 0;
  let closed = false;

  return {
    bytes,
    operations,
    get closed() {
      return closed;
    },
    async seek(offset: number) {
      operations.push({ type: "seek", value: offset });
      position = offset;
    },
    async write(payload: ArrayBuffer | { type: "write"; data: ArrayBuffer }) {
      operations.push({ type: "write" });
      if (options.writeDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.writeDelayMs));
      }
      const data =
        payload instanceof ArrayBuffer ? payload : payload.data;
      const chunk = new Uint8Array(data);
      const targetLength = position + chunk.byteLength;

      if (bytes.length < targetLength) {
        bytes.length = targetLength;
      }

      for (let index = 0; index < chunk.byteLength; index += 1) {
        bytes[position + index] = chunk[index];
      }

      position += chunk.byteLength;
    },
    async close() {
      operations.push({ type: "close" });
      closed = true;
    },
  };
}

interface MockFileNode {
  bytes: number[];
}

interface MockDirectoryHandle {
  kind: "directory";
  name: string;
  files: Map<string, MockFileNode>;
  directories: Map<string, MockDirectoryHandle>;
  getDirectoryHandle(
    childName: string,
    options?: { create?: boolean }
  ): Promise<MockDirectoryHandle>;
  getFileHandle(
    fileName: string,
    options?: { create?: boolean }
  ): Promise<{
    kind: "file";
    name: string;
    createWritable: () => Promise<ReturnType<typeof createMockWritableStream>>;
    getFile: () => Promise<File>;
  }>;
}

function createMockDirectoryHandle(name = "root"): MockDirectoryHandle {
  const files = new Map<string, { bytes: number[] }>();
  const directories = new Map<string, MockDirectoryHandle>();

  return {
    kind: "directory" as const,
    name,
    files,
    directories,
    async getDirectoryHandle(childName: string, options: { create?: boolean } = {}) {
      const existing = directories.get(childName);
      if (existing) {
        return existing;
      }
      if (!options.create) {
        throw new Error(`Missing directory: ${childName}`);
      }
      const created = createMockDirectoryHandle(childName);
      directories.set(childName, created);
      return created;
    },
    async getFileHandle(fileName: string, options: { create?: boolean } = {}) {
      let fileNode = files.get(fileName);
      if (!fileNode) {
        if (!options.create) {
          throw new Error(`Missing file: ${fileName}`);
        }
        fileNode = { bytes: [] };
        files.set(fileName, fileNode);
      }

      return {
        kind: "file" as const,
        name: fileName,
        async createWritable() {
          return createMockWritableStream();
        },
        async getFile() {
          return new File([Uint8Array.from(fileNode!.bytes)], fileName);
        },
      };
    },
  };
}

describe("SequencedDiskWriter", () => {
  it("writes out-of-order chunks sequentially once the missing chunk arrives", async () => {
    const stream = createMockWritableStream();
    const writer = new SequencedDiskWriter(stream as any);

    await writer.writeChunk(1, textToBuffer("B"));
    expect(writer.getBufferStatus()).toMatchObject({
      queueSize: 1,
      nextIndex: 0,
      totalWritten: 0,
    });

    await writer.writeChunk(0, textToBuffer("A"));

    expect(new TextDecoder().decode(Uint8Array.from(stream.bytes))).toBe("AB");
    expect(writer.getBufferStatus()).toMatchObject({
      queueSize: 0,
      nextIndex: 2,
      totalWritten: 2,
    });
  });

  it("flushes remaining buffered chunks on close using explicit seek/write", async () => {
    const stream = createMockWritableStream();
    const writer = new SequencedDiskWriter(stream as any);

    await writer.writeChunk(2, textToBuffer("C"));
    await writer.writeChunk(1, textToBuffer("B"));
    await writer.close();

    expect(stream.operations.some((item) => item.type === "seek")).toBe(true);
    expect(new TextDecoder().decode(Uint8Array.from(stream.bytes))).toContain("B");
    expect(new TextDecoder().decode(Uint8Array.from(stream.bytes))).toContain("C");
    expect(writer.getBufferStatus().queueSize).toBe(0);
  });

  it("serializes concurrent resume writes so late-buffered chunks still flush", async () => {
    const stream = createMockWritableStream({ writeDelayMs: 5 });
    const writer = new SequencedDiskWriter(stream as any, 21);

    await Promise.all([
      writer.writeChunk(21, textToBuffer("A")),
      writer.writeChunk(22, textToBuffer("B")),
      writer.writeChunk(23, textToBuffer("C")),
    ]);

    expect(new TextDecoder().decode(Uint8Array.from(stream.bytes))).toBe("ABC");
    expect(writer.getBufferStatus()).toMatchObject({
      queueSize: 0,
      nextIndex: 24,
      totalWritten: 3,
    });
  });

  it("handles a large burst of concurrent chunk writes without re-flushing the same oldest chunk", async () => {
    const stream = createMockWritableStream({ writeDelayMs: 1 });
    const writer = new SequencedDiskWriter(stream as any);
    const writes: Promise<void>[] = [];

    for (let chunkIndex = 0; chunkIndex < 128; chunkIndex += 1) {
      writes.push(
        writer.writeChunk(chunkIndex, textToBuffer(String(chunkIndex).padStart(3, "0")))
      );
    }

    await Promise.all(writes);

    expect(writer.getBufferStatus()).toMatchObject({
      queueSize: 0,
      nextIndex: 128,
    });
    expect(stream.operations.filter((item) => item.type === "seek")).toHaveLength(0);
  });

  it("waits for queued writes before final close flushing", async () => {
    const stream = createMockWritableStream({ writeDelayMs: 1 });
    const writer = new SequencedDiskWriter(stream as any);
    const writes: Promise<void>[] = [];

    for (let chunkIndex = 0; chunkIndex < 32; chunkIndex += 1) {
      writes.push(
        writer.writeChunk(chunkIndex, textToBuffer(String(chunkIndex).padStart(2, "0")))
      );
    }

    await writer.close();
    await Promise.all(writes);

    expect(writer.getBufferStatus()).toMatchObject({
      queueSize: 0,
      nextIndex: 32,
    });
    expect(stream.operations.filter((item) => item.type === "seek")).toHaveLength(0);
  });
});

describe("StreamingFileWriter", () => {
  it("creates nested directory streams and seeks to the resume offset", async () => {
    const root = createMockDirectoryHandle();
    const writer = new StreamingFileWriter(root as any);

    const result = await writer.createWriteStream(
      "leaf.txt",
      "folder/sub/leaf.txt",
      131072
    );

    expect(root.directories.has("folder")).toBe(true);
    const folder = root.directories.get("folder")!;
    expect(folder.directories.has("sub")).toBe(true);
    expect(result.sequencedWriter.expectedIndex).toBe(2);
  });

  it("reports partial file sizes and returns zero when the file does not exist", async () => {
    const root = createMockDirectoryHandle();
    const writer = new StreamingFileWriter(root as any);
    const folder = await root.getDirectoryHandle("folder", { create: true });
    const fileHandle = await folder.getFileHandle("leaf.txt", { create: true });
    const fileNode = folder.files.get("leaf.txt")!;
    fileNode.bytes = Array.from(new TextEncoder().encode("existing-data"));

    await expect(
      writer.getPartialFileSize("leaf.txt", "folder/leaf.txt")
    ).resolves.toBe("existing-data".length);
    await expect(
      writer.getPartialFileSize("missing.txt", "folder/missing.txt")
    ).resolves.toBe(0);

    expect(await fileHandle.getFile()).toBeInstanceOf(File);
  });

  it("finalizes the sequenced writer before closing the file stream", async () => {
    const writer = new StreamingFileWriter();
    const callOrder: string[] = [];
    const sequencedWriter = {
      close: async () => {
        callOrder.push("sequenced-close");
      },
      getBufferStatus: () => ({
        queueSize: 0,
        nextIndex: 0,
        totalWritten: 3,
      }),
    };
    const stream = {
      close: async () => {
        callOrder.push("stream-close");
      },
    };

    await writer.finalizeWrite(
      sequencedWriter as any,
      stream as any,
      "leaf.txt"
    );

    expect(callOrder).toEqual(["sequenced-close", "stream-close"]);
  });
});
