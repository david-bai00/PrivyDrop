import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  fileRow,
  joinReceiverWithRetry,
  joinSender,
  openClipboardApp,
  receiverStatus,
  requestFileFromReceiver,
  senderStatus,
  syncFileFromSender,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";
import { createAsciiTextFixture } from "../helpers/fileFixtures";

test("downloads each synced file with the expected contents", async ({
  browser,
}, testInfo) => {
  const fixtures = [
    createAsciiTextFixture(
      testInfo,
      "multi-file-a.txt",
      2 * 1024,
      "PrivyDrop E2E multi file fixture A"
    ),
    createAsciiTextFixture(
      testInfo,
      "multi-file-b.txt",
      3 * 1024,
      "PrivyDrop E2E multi file fixture B"
    ),
    createAsciiTextFixture(
      testInfo,
      "multi-file-c.txt",
      4 * 1024,
      "PrivyDrop E2E multi file fixture C"
    ),
  ];
  const roomId = `e2e-multi-file-transfer-${Date.now()}`;
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

    await senderPage.locator("#file-upload").setInputFiles(fixtures.map((fixture) => fixture.filePath));

    for (const fixture of fixtures) {
      await waitForText(senderPage.getByTestId("send-panel"), fixture.fileName, E2E_TIMEOUT.long);
    }

    await senderPage.getByTestId("sender-sync-button").click();

    for (const fixture of fixtures) {
      await waitForText(receiverPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long);
    }

    const downloadedFiles: Array<{ name: string | null; byteLength: number | null }> = [];

    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index]!;

      await requestFileFromReceiver(receiverPage, fixture.fileName);

      await expect
        .poll(
          async () =>
            await receiverPage.evaluate(() => ((window as any).__downloadRecords ?? []).length),
          { timeout: E2E_TIMEOUT.long }
        )
        .toBe(index + 1);

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

      expect(latestDownload.name).toBe(fixture.fileName);
      expect(Buffer.from(latestDownload.bytes ?? [])).toEqual(fixture.buffer);

      await expect(fileRow(senderPage, fixture.fileName)).toContainText("Download count: 1", {
        timeout: E2E_TIMEOUT.long,
      });

      downloadedFiles.push({
        name: latestDownload.name,
        byteLength: latestDownload.bytes?.length ?? null,
      });
    }

    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileNames: fixtures.map((fixture) => fixture.fileName),
      downloadedFiles,
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
