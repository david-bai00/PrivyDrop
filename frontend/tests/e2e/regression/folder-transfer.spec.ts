import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  folderRow,
  joinReceiverWithRetry,
  joinSender,
  openClipboardApp,
  receiverStatus,
  requestFolderFromReceiver,
  senderStatus,
  syncFolderFromSender,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";
import { listFolderFixtureEntries } from "../helpers/fileFixtures";

const FOLDER_ROOT = path.resolve(process.cwd(), "tests/e2e/fixtures/phase4-folder");

test("downloads a synced folder as a zip archive", async ({ browser }, testInfo) => {
  const expectedEntries = listFolderFixtureEntries(FOLDER_ROOT);
  const folderName = path.basename(FOLDER_ROOT);
  const roomId = `e2e-folder-transfer-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await receiverContext.addInitScript(() => {
    const testWindow = window as any;
    testWindow.__downloadRecords = [];
    testWindow.__downloadBlobMap = new Map();

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectURL(blob);
      testWindow.__downloadBlobMap.set(url, blob);
      return url;
    };

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        testWindow.__downloadRecords.push({
          name: this.download,
          href: this.href,
        });
      }
      return originalClick.call(this);
    };
  });

  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  senderPage.on("console", (message) => {
    if (message.type() === "error") {
      senderConsoleErrors.push(message.text());
    }
  });
  receiverPage.on("console", (message) => {
    if (message.type() === "error") {
      receiverConsoleErrors.push(message.text());
    }
  });

  try {
    await Promise.all([openClipboardApp(senderPage), openClipboardApp(receiverPage)]);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);

    await syncFolderFromSender(senderPage, FOLDER_ROOT, folderName);
    await waitForText(receiverPage.getByTestId("retrieve-panel"), folderName, E2E_TIMEOUT.long);

    const senderFolderRow = folderRow(senderPage, folderName);
    await expect(senderFolderRow).toContainText("Download count: 0", {
      timeout: E2E_TIMEOUT.long,
    });

    await requestFolderFromReceiver(receiverPage, folderName);

    await expect
      .poll(
        async () =>
          await receiverPage.evaluate(() => ((window as any).__downloadRecords ?? []).length),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(1);

    await expect(senderFolderRow).toContainText("Download count: 1", {
      timeout: E2E_TIMEOUT.long,
    });

    const latestDownload = await receiverPage.evaluate(async () => {
      const testWindow = window as any;
      const records = testWindow.__downloadRecords ?? [];
      const blobMap = testWindow.__downloadBlobMap as Map<string, Blob>;
      const latestRecord = records[records.length - 1];
      const blob = latestRecord ? blobMap.get(latestRecord.href) : undefined;

      return {
        name: latestRecord?.name ?? null,
        bytes: blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null,
      };
    });

    expect(latestDownload.name).toBe(`${folderName}.zip`);
    expect(latestDownload.bytes).toBeTruthy();

    const zip = await JSZip.loadAsync(Uint8Array.from(latestDownload.bytes ?? []));
    const zipEntries = Object.keys(zip.files)
      .filter((entry) => !zip.files[entry]?.dir)
      .sort();

    expect(zipEntries).toEqual(expectedEntries.map((entry) => entry.relativePath).sort());

    for (const entry of expectedEntries) {
      const zipEntry = zip.file(entry.relativePath);
      expect(zipEntry).toBeTruthy();
      const content = await zipEntry!.async("string");
      expect(content).toBe(entry.content);
    }

    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      folderName,
      zipEntries,
      senderConsoleErrors,
      receiverConsoleErrors,
    });
  } finally {
    await Promise.allSettled([
      senderPage.close(),
      receiverPage.close(),
      senderContext.close(),
      receiverContext.close(),
    ]);
  }
});
