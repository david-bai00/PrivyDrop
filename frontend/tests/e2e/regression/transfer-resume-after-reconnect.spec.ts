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

test("resumes a file transfer after peer reconnection", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "reconnect-resume.txt",
    64 * 1024 * 1024,
    "PrivyDrop E2E reconnect resume fixture"
  );
  const roomId = `e2e-reconnect-resume-${Date.now()}`;

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

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    const senderRoomStatus = senderStatus(senderPage);
    const receiverRoomStatus = receiverStatus(receiverPage);
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await waitForText(receiverPanel, fixture.fileName, E2E_TIMEOUT.long);
    await chooseSaveLocation(receiverPage);
    await requestFileFromReceiver(receiverPage, fixture.fileName);

    await expect
      .poll(
        async () => await getMockFileSize(receiverPage, fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBeGreaterThan(0);

    await closeTrackedPeerConnections(receiverPage);

    const partialSizeAfterInterrupt =
      (await getMockFileSize(receiverPage, fixture.fileName)) ?? 0;

    expect(partialSizeAfterInterrupt).toBeGreaterThan(0);
    expect(partialSizeAfterInterrupt).toBeLessThan(fixture.buffer.length);

    await waitForReconnectRecovered(
      "2 People in the room",
      senderRoomStatus,
      receiverRoomStatus,
      receiverPanel
    );

    const requestCountBeforeResume = (await getCapturedFileRequests(receiverPage)).length;
    await requestFileFromReceiver(receiverPage, fixture.fileName);
    await waitForResumeRequestAfter(receiverPage, requestCountBeforeResume);

    await expect
      .poll(
        async () => await getMockFileHash(receiverPage, fixture.fileName),
        { timeout: 120_000 }
      )
      .toBe(fixture.sha256);

    const capturedFileRequests = await getCapturedFileRequests(receiverPage);
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
      capturedFileRequests,
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
