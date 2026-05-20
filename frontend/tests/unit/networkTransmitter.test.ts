import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NetworkTransmitter } from "@/lib/transfer/NetworkTransmitter";
import type { EmbeddedChunkMeta, SendResult } from "@/types/webrtc";

type Listener = () => void;

function createSendResult(
  overrides: Partial<SendResult> = {}
): SendResult {
  return {
    ok: true,
    peerId: "peer-1",
    attempts: 1,
    finalState: "open",
    ...overrides,
  };
}

function createFakeDataChannel(initialBufferedAmount = 0) {
  const listeners = new Map<string, Set<Listener>>();

  return {
    bufferedAmount: initialBufferedAmount,
    bufferedAmountLowThreshold: 0,
    readyState: "open",
    addEventListener(event: string, listener: Listener) {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
    },
    removeEventListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string) {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

function createTransmitter(options?: {
  sendData?: (data: string | ArrayBuffer, peerId: string) => Promise<SendResult>;
  bufferedAmount?: number;
}) {
  const sentPayloads: Array<string | ArrayBuffer> = [];
  const dataChannel = createFakeDataChannel(options?.bufferedAmount ?? 0);
  const sendData =
    options?.sendData ??
    vi.fn(async () => createSendResult());

  const webrtcConnection = {
    dataChannels: new Map([["peer-1", dataChannel]]),
    sendData: vi.fn(async (data: string | ArrayBuffer, peerId: string) => {
      sentPayloads.push(data);
      return sendData(data, peerId);
    }),
  };

  const transmitter = new NetworkTransmitter(webrtcConnection as any, {} as any);

  return {
    transmitter,
    dataChannel,
    sentPayloads,
    sendDataMock: webrtcConnection.sendData,
  };
}

function parseEmbeddedPacket(packet: ArrayBuffer) {
  const bytes = new Uint8Array(packet);
  const metaLength = new Uint32Array(packet.slice(0, 4))[0];
  const metaJson = new TextDecoder().decode(bytes.slice(4, 4 + metaLength));
  const chunkBytes = bytes.slice(4 + metaLength);

  return {
    meta: JSON.parse(metaJson),
    chunkBytes,
  };
}

describe("NetworkTransmitter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("packages embedded metadata and chunk bytes into one packet", async () => {
    const { transmitter, sentPayloads, sendDataMock } = createTransmitter();
    const chunkData = new Uint8Array([7, 8, 9]).buffer;
    const metadata: EmbeddedChunkMeta = {
      chunkIndex: 2,
      totalChunks: 5,
      chunkSize: 3,
      isLastChunk: false,
      fileOffset: 131072,
      fileId: "file-1",
    };

    await expect(
      transmitter.sendEmbeddedChunk(chunkData, metadata, "peer-1")
    ).resolves.toBe(true);

    expect(sendDataMock).toHaveBeenCalledTimes(1);
    expect(sentPayloads).toHaveLength(1);
    expect(sentPayloads[0]).toBeInstanceOf(ArrayBuffer);

    const parsed = parseEmbeddedPacket(sentPayloads[0] as ArrayBuffer);
    expect(parsed.meta).toEqual(metadata);
    expect(Array.from(parsed.chunkBytes)).toEqual([7, 8, 9]);
  });

  it("splits large array buffers into 64KB fragments", async () => {
    const { transmitter, sentPayloads, sendDataMock } = createTransmitter();
    const payload = new Uint8Array(150000);
    payload.fill(1);

    await transmitter.sendWithBackpressure(payload.buffer, "peer-1");

    expect(sendDataMock).toHaveBeenCalledTimes(3);
    expect(sentPayloads.map((packet) => (packet as ArrayBuffer).byteLength)).toEqual([
      65536,
      65536,
      18928,
    ]);
  });

  it("waits for bufferedamountlow before sending when channel backpressure is high", async () => {
    const { transmitter, dataChannel, sendDataMock } = createTransmitter({
      bufferedAmount: 4 * 1024 * 1024,
    });

    const sendTask = transmitter.sendWithBackpressure("hello", "peer-1");
    await Promise.resolve();

    expect(dataChannel.bufferedAmountLowThreshold).toBe(512 * 1024);
    expect(dataChannel.listenerCount("bufferedamountlow")).toBe(1);
    expect(sendDataMock).not.toHaveBeenCalled();

    dataChannel.emit("bufferedamountlow");
    await sendTask;

    expect(sendDataMock).toHaveBeenCalledTimes(1);
    expect(dataChannel.listenerCount("bufferedamountlow")).toBe(0);
  });

  it("falls back to timeout when bufferedamountlow is never emitted", async () => {
    const { transmitter, dataChannel, sendDataMock } = createTransmitter({
      bufferedAmount: 4 * 1024 * 1024,
    });

    const sendTask = transmitter.sendWithBackpressure("hello", "peer-1");
    await Promise.resolve();

    expect(sendDataMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    await sendTask;

    expect(sendDataMock).toHaveBeenCalledTimes(1);
    expect(dataChannel.listenerCount("bufferedamountlow")).toBe(0);
  });

  it("throws when the underlying send result is unsuccessful", async () => {
    const { transmitter } = createTransmitter({
      sendData: async () =>
        createSendResult({
          ok: false,
          finalState: "closing",
          reason: "data_channel_not_ready",
        }),
    });

    await expect(
      transmitter.sendWithBackpressure("hello", "peer-1")
    ).rejects.toThrow("sendData failed: data_channel_not_ready");
  });
});
