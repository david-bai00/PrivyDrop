import path from "node:path";
import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  chooseSaveLocation,
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
import {
  getMockSnapshot,
  installMockSaveDirectory,
  resetMockSaveDirectory,
} from "../helpers/mockSaveDirectory";

const FOLDER_ROOT = path.resolve(process.cwd(), "tests/e2e/fixtures/phase4-folder");

test("saves a synced folder into the chosen save directory", async ({
  browser,
}, testInfo) => {
  const expectedEntries = listFolderFixtureEntries(FOLDER_ROOT);
  const folderName = path.basename(FOLDER_ROOT);
  const roomId = `e2e-folder-save-dir-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await installMockSaveDirectory(receiverContext, { mode: "memory" });
  await receiverContext.addInitScript(() => {
    const testWindow = window as any;
    testWindow.__downloadRecords = [];

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        testWindow.__downloadRecords.push({
          name: this.download,
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
    await resetMockSaveDirectory(receiverPage);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);

    await syncFolderFromSender(senderPage, FOLDER_ROOT, folderName);
    await waitForText(receiverPage.getByTestId("retrieve-panel"), folderName, E2E_TIMEOUT.long);

    await chooseSaveLocation(receiverPage);
    await requestFolderFromReceiver(receiverPage, folderName);

    const senderFolderRow = folderRow(senderPage, folderName);
    await expect(senderFolderRow).toContainText("Download count: 1", {
      timeout: E2E_TIMEOUT.long,
    });

    await expect
      .poll(async () => Object.keys(await getMockSnapshot(receiverPage)).length, {
        timeout: E2E_TIMEOUT.long,
      })
      .toBe(expectedEntries.length);

    const savedFiles = await getMockSnapshot(receiverPage);
    const downloadRecordCount = await receiverPage.evaluate(
      () => ((window as any).__downloadRecords ?? []).length
    );

    expect(Object.keys(savedFiles).sort()).toEqual(
      expectedEntries.map((entry) => entry.relativePath).sort()
    );

    for (const entry of expectedEntries) {
      expect(savedFiles[entry.relativePath]).toBe(entry.content);
    }

    expect(downloadRecordCount).toBe(0);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      folderName,
      savedFiles,
      downloadRecordCount,
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
