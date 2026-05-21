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
  installMockSaveDirectory,
  resetMockSaveDirectory,
  seedMockFile,
} from "../helpers/mockSaveDirectory";

test("resumes a single file from an existing partial download", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "resume-single-file.txt",
    8 * 1024 * 1024,
    "PrivyDrop E2E partial resume fixture"
  );
  const resumeOffset = 64 * 1024;
  const roomId = `e2e-resume-single-${Date.now()}`;

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
    await seedMockFile(
      receiverPage,
      fixture.fileName,
      fixture.buffer.subarray(0, resumeOffset)
    );

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await waitForText(receiverPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long);
    await chooseSaveLocation(receiverPage);
    await requestFileFromReceiver(receiverPage, fixture.fileName);

    await expect
      .poll(async () => {
        const requests = await getCapturedFileRequests(receiverPage);
        return requests.find(
          (request) =>
            request?.type === "fileRequest" &&
            request.fileId?.includes(fixture.fileName) &&
            request.offset === resumeOffset
        );
      }, { timeout: E2E_TIMEOUT.long })
      .toBeTruthy();

    await expect
      .poll(
        async () => await getMockFileHash(receiverPage, fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(fixture.sha256);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      expectedHash: fixture.sha256,
      resumeOffset,
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
