import { expect, test, type Locator } from "@playwright/test";
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

async function collectProgressSamplesUntilDownloadCount(
  rowLocator: Locator,
  timeout = E2E_TIMEOUT.long * 2
) {
  const startedAt = Date.now();
  const percentages: number[] = [];
  const rawTexts: string[] = [];

  while (Date.now() - startedAt < timeout) {
    const text = (await rowLocator.textContent()) ?? "";
    rawTexts.push(text);

    const matches = Array.from(text.matchAll(/(\d+)%/g));
    if (matches.length > 0) {
      percentages.push(Number(matches[matches.length - 1]![1]));
    }

    if (text.includes("Download count: 1")) {
      return { percentages, rawTexts };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for large file transfer completion");
}

test("shows intermediate progress while downloading a large file", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "large-progress.bin",
    64 * 1024 * 1024,
    "PrivyDrop E2E large file progress fixture"
  );
  const roomId = `e2e-large-progress-${Date.now()}`;
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

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await waitForText(receiverPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long);

    const senderFileRow = fileRow(senderPage, fixture.fileName);
    await requestFileFromReceiver(receiverPage, fixture.fileName);

    const progressTrace = await collectProgressSamplesUntilDownloadCount(senderFileRow);
    const uniquePercentages = progressTrace.percentages.filter(
      (value, index, array) => index === 0 || value !== array[index - 1]
    );
    const intermediatePercentages = uniquePercentages.filter(
      (value) => value > 0 && value < 100
    );

    expect(intermediatePercentages.length).toBeGreaterThanOrEqual(2);

    for (let index = 1; index < uniquePercentages.length; index += 1) {
      expect(uniquePercentages[index]!).toBeGreaterThanOrEqual(
        uniquePercentages[index - 1]!
      );
    }

    await expect
      .poll(
        async () =>
          await receiverPage.evaluate(() => ((window as any).__downloadRecords ?? []).length),
        { timeout: E2E_TIMEOUT.long * 2 }
      )
      .toBe(1);

    const latestDownload = await receiverPage.evaluate(async () => {
      const testWindow = window as any;
      const records = testWindow.__downloadRecords ?? [];
      const blobMap = testWindow.__downloadBlobMap as Map<string, Blob>;
      const latestRecord = records[records.length - 1];
      const blob = latestRecord ? blobMap.get(latestRecord.href) : undefined;

      return {
        name: latestRecord?.name ?? null,
        size: blob?.size ?? null,
      };
    });

    expect(latestDownload.name).toBe(fixture.fileName);
    expect(latestDownload.size).toBe(fixture.buffer.length);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      fileSize: fixture.buffer.length,
      progressSamples: uniquePercentages,
      latestDownload,
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
