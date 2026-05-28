import path from "node:path";
import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  chooseSaveLocation,
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
  getCapturedFileRequests,
  getMockSnapshot,
  installMockSaveDirectory,
  resetMockSaveDirectory,
  seedMockFile,
} from "../helpers/mockSaveDirectory";

const FOLDER_ROOT = path.resolve(
  process.cwd(),
  "tests/e2e/fixtures/phase4-folder"
);

test("resumes a folder download from an existing partial file", async ({
  browser,
}, testInfo) => {
  const expectedEntries = listFolderFixtureEntries(FOLDER_ROOT);
  const folderName = path.basename(FOLDER_ROOT);
  const partialTarget = expectedEntries.find(
    (entry) => entry.relativePath === `${folderName}/root-note.txt`
  );

  expect(partialTarget).toBeTruthy();

  const partialBytes = Buffer.from(partialTarget!.content ?? "", "utf8").subarray(0, 7);
  const roomId = `e2e-folder-partial-${Date.now()}`;

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();

  await installMockSaveDirectory(receiverContext, { mode: "memory" });

  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  try {
    await Promise.all([
      openClipboardApp(senderPage),
      openClipboardApp(receiverPage),
    ]);

    await resetMockSaveDirectory(receiverPage);
    await seedMockFile(receiverPage, partialTarget!.relativePath, partialBytes);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);

    await syncFolderFromSender(senderPage, FOLDER_ROOT, folderName);
    await waitForText(receiverPage.getByTestId("retrieve-panel"), folderName, E2E_TIMEOUT.long);
    await chooseSaveLocation(receiverPage);
    await requestFolderFromReceiver(receiverPage, folderName);

    await expect
      .poll(async () => {
        const requests = await getCapturedFileRequests(receiverPage);
        return requests.find(
          (request) =>
            request?.type === "fileRequest" &&
            request.fileId?.includes("root-note.txt") &&
            request.offset === partialBytes.length
        );
      }, { timeout: E2E_TIMEOUT.long })
      .toBeTruthy();

    await expect
      .poll(async () => Object.keys(await getMockSnapshot(receiverPage)).length, {
        timeout: E2E_TIMEOUT.long,
      })
      .toBe(expectedEntries.length);

    const savedFiles = await getMockSnapshot(receiverPage);

    expect(Object.keys(savedFiles).sort()).toEqual(
      expectedEntries.map((entry) => entry.relativePath).sort()
    );

    for (const entry of expectedEntries) {
      expect(savedFiles[entry.relativePath]).toBe(entry.content);
    }

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      folderName,
      partialFile: partialTarget!.relativePath,
      partialSizeBytes: partialBytes.length,
      savedFiles,
      capturedFileRequests: await getCapturedFileRequests(receiverPage),
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
