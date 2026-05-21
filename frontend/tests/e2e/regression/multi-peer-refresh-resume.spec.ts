import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  chooseSaveLocation,
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
import {
  getCapturedFileRequests,
  getMockFileHash,
  getMockFileSize,
  installMockSaveDirectory,
  resetMockSaveDirectory,
} from "../helpers/mockSaveDirectory";

test("keeps multi-peer transfer stable when one receiver refreshes and resumes", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "multi-peer-refresh-resume.txt",
    12 * 1024 * 1024,
    "PrivyDrop E2E multi-peer refresh resume fixture"
  );
  const roomId = `e2e-multi-refresh-${Date.now()}`;
  const dbNamespace = `-receiver-b-${testInfo.testId}`;

  const senderContext = await browser.newContext();
  const receiverAContext = await browser.newContext();
  const receiverBContext = await browser.newContext();

  await Promise.all([
    installMockSaveDirectory(receiverAContext, { mode: "memory" }),
    installMockSaveDirectory(receiverBContext, {
      mode: "indexeddb",
      namespace: dbNamespace,
    }),
  ]);

  const senderPage = await senderContext.newPage();
  const receiverAPage = await receiverAContext.newPage();
  const receiverBPage = await receiverBContext.newPage();

  try {
    await Promise.all([
      openClipboardApp(senderPage),
      openClipboardApp(receiverAPage),
      openClipboardApp(receiverBPage),
    ]);

    await Promise.all([
      resetMockSaveDirectory(receiverAPage),
      resetMockSaveDirectory(receiverBPage),
    ]);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverAPage, roomId);
    await joinReceiverWithRetry(receiverBPage, roomId);

    await waitForText(senderStatus(senderPage), "3 People in the room", E2E_TIMEOUT.long);
    await Promise.all([
      waitForText(receiverStatus(receiverAPage), "Connected", E2E_TIMEOUT.long),
      waitForText(receiverStatus(receiverBPage), "Connected", E2E_TIMEOUT.long),
    ]);

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await Promise.all([
      waitForText(receiverAPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long),
      waitForText(receiverBPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long),
    ]);

    await Promise.all([
      chooseSaveLocation(receiverAPage),
      chooseSaveLocation(receiverBPage),
    ]);
    await Promise.all([
      requestFileFromReceiver(receiverAPage, fixture.fileName),
      requestFileFromReceiver(receiverBPage, fixture.fileName),
    ]);

    await expect
      .poll(
        async () => await getMockFileSize(receiverAPage, fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBeGreaterThanOrEqual(64 * 1024);

    await expect
      .poll(
        async () => await getMockFileSize(receiverBPage, fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBeGreaterThanOrEqual(64 * 1024);

    const partialSizeBeforeRefresh =
      (await getMockFileSize(receiverBPage, fixture.fileName)) ?? 0;

    await receiverBPage.reload({ waitUntil: "networkidle" });
    const persistedPartialSizeAfterRefresh =
      (await getMockFileSize(receiverBPage, fixture.fileName)) ?? 0;

    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);
    await joinReceiverWithRetry(receiverBPage, roomId);
    await waitForText(senderStatus(senderPage), "3 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverStatus(receiverBPage), "Connected", E2E_TIMEOUT.long);
    await waitForText(receiverBPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long);
    await chooseSaveLocation(receiverBPage);
    await requestFileFromReceiver(receiverBPage, fixture.fileName);

    await expect
      .poll(async () => {
        const requests = await getCapturedFileRequests(receiverBPage);
        return requests.find(
          (request) =>
            request?.type === "fileRequest" &&
            request.fileId?.includes(fixture.fileName) &&
            typeof request.offset === "number" &&
            request.offset > 0
        )?.offset;
      }, { timeout: E2E_TIMEOUT.long })
      .toBe(persistedPartialSizeAfterRefresh);

    await expect
      .poll(
        async () => await getMockFileHash(receiverAPage, fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(fixture.sha256);

    await expect
      .poll(
        async () => await getMockFileHash(receiverBPage, fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(fixture.sha256);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      expectedHash: fixture.sha256,
      partialSizeBeforeRefresh,
      persistedPartialSizeAfterRefresh,
      receiverBFileRequests: await getCapturedFileRequests(receiverBPage),
    });
  } finally {
    await Promise.allSettled([
      senderPage.close(),
      receiverAPage.close(),
      receiverBPage.close(),
      senderContext.close(),
      receiverAContext.close(),
      receiverBContext.close(),
    ]);
  }
});
