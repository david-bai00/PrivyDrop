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
  closeTrackedPeerConnections,
  getCapturedFileRequests,
  getMockFileHash,
  getMockFileSize,
  installMockSaveDirectory,
} from "../helpers/mockSaveDirectory";
import {
  waitForReconnectRecovered,
  waitForResumeRequestAfter,
} from "../helpers/reconnect";

test("keeps peer A healthy while peer B reconnects and resumes transfer", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "multi-peer-transfer-resume.txt",
    64 * 1024 * 1024,
    "PrivyDrop E2E multi-peer reconnect resume fixture"
  );
  const roomId = `e2e-multi-transfer-${Date.now()}`;

  const senderContext = await browser.newContext();
  const receiverAContext = await browser.newContext();
  const receiverBContext = await browser.newContext();

  await Promise.all([
    installMockSaveDirectory(receiverAContext, { mode: "memory" }),
    installMockSaveDirectory(receiverBContext, { mode: "memory" }),
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

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverAPage, roomId);
    await receiverAPage.waitForTimeout(15_000);
    await joinReceiverWithRetry(receiverBPage, roomId);

    const senderRoomStatus = senderStatus(senderPage);
    const receiverAStatus = receiverStatus(receiverAPage);
    const receiverBStatus = receiverStatus(receiverBPage);
    const receiverBPanel = receiverBPage.getByTestId("retrieve-panel");

    await waitForText(senderRoomStatus, "3 People in the room", E2E_TIMEOUT.long);
    await Promise.all([
      waitForText(receiverAStatus, "Connected", E2E_TIMEOUT.long),
      waitForText(receiverBStatus, "Connected", E2E_TIMEOUT.long),
    ]);

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await Promise.all([
      waitForText(receiverAPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long),
      waitForText(receiverBPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long),
    ]);

    await chooseSaveLocation(receiverBPage);
    await requestFileFromReceiver(receiverBPage, fixture.fileName);

    await expect
      .poll(
        async () => await getMockFileSize(receiverBPage, fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBeGreaterThan(0);

    await closeTrackedPeerConnections(receiverBPage);

    const partialSizeAfterInterrupt =
      (await getMockFileSize(receiverBPage, fixture.fileName)) ?? 0;

    await waitForText(receiverAStatus, "Connected", E2E_TIMEOUT.long);

    await waitForReconnectRecovered(
      "3 People in the room",
      senderRoomStatus,
      receiverBStatus,
      receiverBPanel,
      180_000
    );

    const requestCountBeforeResume = (await getCapturedFileRequests(receiverBPage)).length;
    await waitForText(receiverBPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long);
    await requestFileFromReceiver(receiverBPage, fixture.fileName);
    await waitForResumeRequestAfter(receiverBPage, requestCountBeforeResume);

    await expect
      .poll(
        async () => await getMockFileHash(receiverBPage, fixture.fileName),
        { timeout: 180_000 }
      )
      .toBe(fixture.sha256);

    await waitForText(receiverAStatus, "Connected", E2E_TIMEOUT.long);

    const capturedFileRequests = await getCapturedFileRequests(receiverBPage);
    const resumeRequest = capturedFileRequests
      .slice(requestCountBeforeResume)
      .find(
        (request) =>
          request?.type === "fileRequest" &&
          typeof request.offset === "number" &&
          request.offset > 0
      );

    expect(partialSizeAfterInterrupt).toBeGreaterThan(0);
    expect(partialSizeAfterInterrupt).toBeLessThan(fixture.buffer.length);
    expect(resumeRequest?.offset).toBe(partialSizeAfterInterrupt);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      partialSizeAfterInterrupt,
      resumedOffset: resumeRequest?.offset,
      expectedHash: fixture.sha256,
      receiverBFileRequests: capturedFileRequests,
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
