import type { BrowserContext, Page } from "@playwright/test";

type MockMode = "memory" | "indexeddb";

interface InstallMockSaveDirectoryOptions {
  mode: MockMode;
  namespace?: string;
}

export async function installMockSaveDirectory(
  context: BrowserContext,
  options: InstallMockSaveDirectoryOptions
) {
  await context.addInitScript(
    ({ mode, namespace }) => {
      const NativeRTCPeerConnection = window.RTCPeerConnection;
      const storageMode = mode;
      const dbName = `__privydrop_e2e_mock_fs__${namespace ?? ""}`;
      const storeName = "files";
      const memoryStore = new Map<string, Uint8Array>();
      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();
      const testWindow = window as any;

      class TrackingRTCPeerConnection extends NativeRTCPeerConnection {
        constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
          super(...args);
          testWindow.__rtcPeerConnections.push(this);
        }
      }

      testWindow.__rtcPeerConnections = [];
      window.RTCPeerConnection = TrackingRTCPeerConnection;

      const normalizeData = async (payload: unknown): Promise<Uint8Array> => {
        if (payload instanceof ArrayBuffer) {
          return new Uint8Array(payload);
        }
        if (ArrayBuffer.isView(payload)) {
          return new Uint8Array(
            payload.buffer,
            payload.byteOffset,
            payload.byteLength
          );
        }
        if (payload instanceof Blob) {
          return new Uint8Array(await payload.arrayBuffer());
        }
        if (typeof payload === "string") {
          return textEncoder.encode(payload);
        }
        throw new Error(`Unsupported mock FS payload: ${typeof payload}`);
      };

      const openDb = (() => {
        let dbPromise: Promise<IDBDatabase> | undefined;

        return () => {
          if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
              const request = indexedDB.open(dbName, 1);

              request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(storeName)) {
                  db.createObjectStore(storeName);
                }
              };
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
          }

          return dbPromise;
        };
      })();

      const withStore = async <T>(
        modeName: IDBTransactionMode,
        operation: (store: IDBObjectStore) => IDBRequest<T>
      ) => {
        const db = await openDb();

        return new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(storeName, modeName);
          const store = transaction.objectStore(storeName);
          const request = operation(store);

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      };

      const loadFileBytes = async (targetPath: string): Promise<Uint8Array> => {
        if (storageMode === "memory") {
          return memoryStore.get(targetPath) ?? new Uint8Array(0);
        }

        const value = await withStore("readonly", (store) => store.get(targetPath));
        if (!value) {
          return new Uint8Array(0);
        }
        if (value instanceof Uint8Array) {
          return value;
        }
        if (value instanceof ArrayBuffer) {
          return new Uint8Array(value);
        }
        return new Uint8Array(value as ArrayLike<number>);
      };

      const storeFileBytes = async (targetPath: string, bytes: Uint8Array) => {
        if (storageMode === "memory") {
          memoryStore.set(targetPath, Uint8Array.from(bytes));
          return;
        }

        await withStore("readwrite", (store) => store.put(bytes, targetPath));
      };

      const listFilePaths = async (): Promise<string[]> => {
        if (storageMode === "memory") {
          return Array.from(memoryStore.keys());
        }

        const keys = await withStore("readonly", (store) => store.getAllKeys());
        return keys.map((key) => String(key));
      };

      const clearFiles = async () => {
        if (storageMode === "memory") {
          memoryStore.clear();
          return;
        }

        await withStore("readwrite", (store) => store.clear());
      };

      const digestHex = async (bytes: Uint8Array) => {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      };

      class MockWritableFileStream {
        targetPath: string;

        position = 0;

        constructor(targetPath: string) {
          this.targetPath = targetPath;
        }

        async seek(offset: number) {
          this.position = offset;
        }

        async write(payload: unknown) {
          if (
            payload &&
            typeof payload === "object" &&
            "type" in payload &&
            (payload as any).type === "seek"
          ) {
            await this.seek((payload as any).position);
            return;
          }

          let data = payload;
          if (
            payload &&
            typeof payload === "object" &&
            "type" in payload &&
            (payload as any).type === "write"
          ) {
            data = (payload as any).data;
          }

          const incomingBytes = await normalizeData(data);
          const currentBytes = await loadFileBytes(this.targetPath);
          const nextLength = Math.max(
            currentBytes.length,
            this.position + incomingBytes.length
          );
          const merged = new Uint8Array(nextLength);

          merged.set(currentBytes);
          merged.set(incomingBytes, this.position);
          this.position += incomingBytes.length;
          await storeFileBytes(this.targetPath, merged);
        }

        async close() {}
      }

      class MockFileHandle {
        readonly kind = "file";

        readonly name: string;

        constructor(private readonly targetPath: string) {
          this.name = targetPath.split("/").filter(Boolean).pop() ?? targetPath;
        }

        async createWritable(options: { keepExistingData?: boolean } = {}) {
          if (!(options.keepExistingData === true)) {
            await storeFileBytes(this.targetPath, new Uint8Array(0));
          }
          return new MockWritableFileStream(this.targetPath);
        }

        async getFile() {
          const bytes = await loadFileBytes(this.targetPath);
          if (bytes.length === 0) {
            throw new Error(`Mock file not found: ${this.targetPath}`);
          }
          return new File([bytes], this.name);
        }
      }

      class MockDirectoryHandle {
        readonly kind = "directory";

        readonly name: string;

        constructor(private readonly pathPrefix = "") {
          this.name = pathPrefix.split("/").filter(Boolean).pop() ?? "";
        }

        private childPath(name: string) {
          return this.pathPrefix ? `${this.pathPrefix}/${name}` : name;
        }

        async getDirectoryHandle(name: string) {
          return new MockDirectoryHandle(this.childPath(name));
        }

        async getFileHandle(
          name: string,
          options: { create?: boolean } = {}
        ) {
          const targetPath = this.childPath(name);

          if (options.create) {
            const existingBytes = await loadFileBytes(targetPath);
            if (existingBytes.length === 0) {
              await storeFileBytes(targetPath, new Uint8Array(0));
            }
          }

          return new MockFileHandle(targetPath);
        }
      }

      const originalSend = RTCDataChannel.prototype.send;
      testWindow.__capturedFileRequests = [];

      RTCDataChannel.prototype.send = function patchedSend(data) {
        if (typeof data === "string") {
          try {
            const parsed = JSON.parse(data);
            if (parsed?.type === "fileRequest") {
              testWindow.__capturedFileRequests.push(parsed);
            }
          } catch {
            // Ignore non-JSON channel payloads.
          }
        }

        return (originalSend as any).call(this, data);
      };

      testWindow.__resetMockFs = clearFiles;
      testWindow.__seedMockFile = async (targetPath: string, base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        await storeFileBytes(targetPath, bytes);
      };
      testWindow.__mockFsFileSize = async (targetPath: string) => {
        const bytes = await loadFileBytes(targetPath);
        return bytes.length > 0 ? bytes.length : null;
      };
      testWindow.__mockFsFileHash = async (targetPath: string) => {
        const bytes = await loadFileBytes(targetPath);
        return bytes.length > 0 ? digestHex(bytes) : null;
      };
      testWindow.__mockFsFileText = async (targetPath: string) => {
        const bytes = await loadFileBytes(targetPath);
        return bytes.length > 0 ? textDecoder.decode(bytes) : null;
      };
      testWindow.__mockFsFileCount = async () => {
        const filePaths = await listFilePaths();
        return filePaths.length;
      };
      testWindow.__mockFsSnapshot = async () => {
        const snapshot: Record<string, string> = {};
        const filePaths = await listFilePaths();

        for (const filePath of filePaths) {
          snapshot[filePath] = textDecoder.decode(await loadFileBytes(filePath));
        }

        return snapshot;
      };
      testWindow.__closeRtcPeerConnections = async () => {
        for (const connection of testWindow.__rtcPeerConnections) {
          if (connection && connection.connectionState !== "closed") {
            connection.close();
          }
        }
      };

      testWindow.showDirectoryPicker = async () => new MockDirectoryHandle("");
      testWindow.confirm = () => true;
    },
    { mode: options.mode, namespace: options.namespace }
  );
}

export async function resetMockSaveDirectory(page: Page) {
  await page.evaluate(async () => {
    await (window as any).__resetMockFs();
  });
}

export async function seedMockFile(
  page: Page,
  targetPath: string,
  bytes: Buffer | Uint8Array
) {
  await page.evaluate(
    async ({ filePath, base64 }) => {
      await (window as any).__seedMockFile(filePath, base64);
    },
    { filePath: targetPath, base64: Buffer.from(bytes).toString("base64") }
  );
}

export async function getMockFileSize(page: Page, targetPath: string) {
  return page.evaluate(async (filePath) => {
    return await (window as any).__mockFsFileSize(filePath);
  }, targetPath);
}

export async function getMockFileHash(page: Page, targetPath: string) {
  return page.evaluate(async (filePath) => {
    return await (window as any).__mockFsFileHash(filePath);
  }, targetPath);
}

export async function getCapturedFileRequests(page: Page) {
  return page.evaluate(() => {
    return (window as any).__capturedFileRequests as Array<{
      type: string;
      fileId?: string;
      offset?: number;
    }>;
  });
}

export async function getMockFileText(page: Page, targetPath: string) {
  return page.evaluate(async (filePath) => {
    return await (window as any).__mockFsFileText(filePath);
  }, targetPath);
}

export async function getMockFileCount(page: Page) {
  return page.evaluate(async () => {
    return await (window as any).__mockFsFileCount();
  });
}

export async function getMockSnapshot(page: Page) {
  return page.evaluate(async () => {
    return (await (window as any).__mockFsSnapshot()) as Record<string, string>;
  });
}

export async function closeTrackedPeerConnections(page: Page) {
  await page.evaluate(async () => {
    await (window as any).__closeRtcPeerConnections();
  });
}
