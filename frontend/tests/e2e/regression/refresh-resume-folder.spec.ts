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
import { createGeneratedFolderFixture } from "../helpers/fileFixtures";
import {
  getCapturedFileRequests,
  getMockFileCount,
  getMockFileHash,
  getMockFileSize,
  getMockFileText,
  installMockSaveDirectory,
  resetMockSaveDirectory,
} from "../helpers/mockSaveDirectory";

test("resumes a folder download after receiver refresh", async ({
  browser,
}, testInfo) => {
  const folderFixture = createGeneratedFolderFixture(
    testInfo,
    "phase5-folder-refresh",
    8 * 1024 * 1024,
    "PrivyDrop E2E folder refresh resume fixture"
  );
  const rootEntry = folderFixture.entries.find((entry) =>
    entry.relativePath.endsWith("root-note.txt")
  );
  const nestedEntry = folderFixture.entries.find((entry) =>
    entry.relativePath.endsWith("nested-note.txt")
  );
  const leafEntry = folderFixture.entries.find((entry) =>
    entry.relativePath.endsWith("leaf.txt")
  );

  expect(rootEntry && nestedEntry && leafEntry).toBeTruthy();

  const roomId = `e2e-folder-refresh-${Date.now()}`;
  const dbNamespace = `-${testInfo.testId}`;

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();

  await installMockSaveDirectory(receiverContext, {
    mode: "indexeddb",
    namespace: dbNamespace,
  });

  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  try {
    await Promise.all([
      openClipboardApp(senderPage),
      openClipboardApp(receiverPage),
    ]);

    await resetMockSaveDirectory(receiverPage);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);
    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);

    await syncFolderFromSender(
      senderPage,
      folderFixture.folderRoot,
      folderFixture.folderName
    );
    await waitForText(
      receiverPage.getByTestId("retrieve-panel"),
      folderFixture.folderName,
      E2E_TIMEOUT.long
    );
    await chooseSaveLocation(receiverPage);
    await requestFolderFromReceiver(receiverPage, folderFixture.folderName);

    await expect
      .poll(
        async () => await getMockFileSize(receiverPage, rootEntry!.relativePath),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBeGreaterThanOrEqual(64 * 1024);

    const partialSizeBeforeRefresh =
      (await getMockFileSize(receiverPage, rootEntry!.relativePath)) ?? 0;

    await receiverPage.reload({ waitUntil: "networkidle" });

    const persistedPartialSizeAfterRefresh =
      (await getMockFileSize(receiverPage, rootEntry!.relativePath)) ?? 0;

    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.long);
    await joinReceiverWithRetry(receiverPage, roomId);
    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);
    await waitForText(
      receiverPage.getByTestId("retrieve-panel"),
      folderFixture.folderName,
      E2E_TIMEOUT.long
    );
    await chooseSaveLocation(receiverPage);
    await requestFolderFromReceiver(receiverPage, folderFixture.folderName);

    await expect
      .poll(async () => {
        const requests = await getCapturedFileRequests(receiverPage);
        return requests.find(
          (request) =>
            request?.type === "fileRequest" &&
            request.fileId?.includes("root-note.txt") &&
            request.offset === persistedPartialSizeAfterRefresh
        );
      }, { timeout: E2E_TIMEOUT.long })
      .toBeTruthy();

    await expect
      .poll(
        async () => await getMockFileHash(receiverPage, rootEntry!.relativePath),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(rootEntry!.hash);

    await expect
      .poll(
        async () => await getMockFileText(receiverPage, nestedEntry!.relativePath),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(nestedEntry!.content);

    await expect
      .poll(
        async () => await getMockFileText(receiverPage, leafEntry!.relativePath),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(leafEntry!.content);

    await expect
      .poll(async () => await getMockFileCount(receiverPage), {
        timeout: E2E_TIMEOUT.long,
      })
      .toBe(folderFixture.entries.length);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      folderName: folderFixture.folderName,
      partialSizeBeforeRefresh,
      persistedPartialSizeAfterRefresh,
      finalRootHash: await getMockFileHash(receiverPage, rootEntry!.relativePath),
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
