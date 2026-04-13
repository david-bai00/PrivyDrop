import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLoggingConfig: vi.fn(),
  postLogToBackend: vi.fn(),
}));

vi.mock("@/app/config/environment", () => ({
  getLoggingConfig: mocks.getLoggingConfig,
}));

vi.mock("@/app/config/api", () => ({
  postLogToBackend: mocks.postLogToBackend,
}));

import { createLogger } from "@/lib/logger";

describe("runtime logger", () => {
  beforeEach(() => {
    mocks.postLogToBackend.mockReset();
    mocks.postLogToBackend.mockResolvedValue(undefined);
    mocks.getLoggingConfig.mockReset();
    mocks.getLoggingConfig.mockReturnValue({
      enableBackendLogs: true,
      enableDebugConsoleLogs: true,
      enableInfoConsoleLogs: true,
      backendSampleRates: {
        debug: 1,
        info: 1,
        warn: 1,
        error: 1,
      },
    });
  });

  it("writes structured backend envelopes", () => {
    const logger = createLogger({ scope: "WebRTC.Base" });
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info({
      event: "socket_connected",
      context: {
        peerId: "peer-1",
      },
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[INFO] [WebRTC.Base] socket_connected",
      { peerId: "peer-1" }
    );
    expect(mocks.postLogToBackend).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(mocks.postLogToBackend.mock.calls[0][0]);
    expect(payload.level).toBe("info");
    expect(payload.scope).toBe("WebRTC.Base");
    expect(payload.event).toBe("socket_connected");
    expect(payload.context).toEqual({ peerId: "peer-1" });
    expect(typeof payload.timestamp).toBe("string");

    consoleInfoSpy.mockRestore();
  });

  it("applies explicit sampling to backend debug logs", () => {
    const logger = createLogger({ scope: "Transfer.ProgressTracker" });
    const consoleDebugSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});

    logger.debug({
      event: "folder_progress_updated",
      context: { folderName: "docs" },
      sample: { rate: 0 },
    });

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(mocks.postLogToBackend).not.toHaveBeenCalled();

    consoleDebugSpy.mockRestore();
  });

  it("never samples warn logs away when backend logging is enabled", () => {
    mocks.getLoggingConfig.mockReturnValue({
      enableBackendLogs: true,
      enableDebugConsoleLogs: false,
      enableInfoConsoleLogs: false,
      backendSampleRates: {
        debug: 0,
        info: 0,
        warn: 1,
        error: 1,
      },
    });

    const logger = createLogger({ scope: "Receive.ChunkProcessor" });
    logger.warn({
      event: "chunk_size_mismatch",
      context: { expectedChunkSize: 8, actualChunkSize: 4 },
      sample: { rate: 0 },
    });

    expect(mocks.postLogToBackend).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid scopes and invalid event names", () => {
    expect(() => createLogger({ scope: "fileUtils" })).toThrow(
      /Invalid logger scope/
    );

    const logger = createLogger({ scope: "FileUtils" });
    expect(() =>
      logger.info({
        event: "Download Failed",
      })
    ).toThrow(/Invalid logger event/);
  });
});
