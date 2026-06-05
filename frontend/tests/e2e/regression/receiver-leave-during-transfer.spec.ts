import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  chooseSaveLocation,
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
import { installMockSaveDirectory } from "../helpers/mockSaveDirectory";
import { waitForTransferStart } from "../helpers/reconnect";

test("returns receiver to the join state when leaving during transfer", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "receiver-leave.txt",
    128 * 1024 * 1024,
    "PrivyDrop E2E receiver leave during transfer fixture"
  );
  const roomId = `e2e-receiver-leave-${Date.now()}`;

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await receiverContext.addInitScript(() => {
    window.confirm = () => true;
  });
  await installMockSaveDirectory(receiverContext, { mode: "memory" });

  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  try {
    await Promise.all([openClipboardApp(senderPage), openClipboardApp(receiverPage)]);

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

    const senderFileRow = fileRow(senderPage, fixture.fileName);
    await waitForTransferStart(senderFileRow);
    const senderFileRowTextBeforeLeave = (await senderFileRow.textContent()) ?? "";

    await receiverPage.getByTestId("receiver-leave-room-button").click();

    await waitForText(senderRoomStatus, "You're the only one here", E2E_TIMEOUT.medium);
    await waitForText(
      receiverPanel,
      "You can accept an invitation to join the room",
      E2E_TIMEOUT.medium
    );

    const receiverPanelText = (await receiverPanel.textContent()) ?? "";
    const senderFileRowText = (await senderFileRow.textContent()) ?? "";
    const receiverJoinDisabled = await receiverPage
      .getByTestId("receiver-join-room-button")
      .isDisabled();

    expect(senderFileRowTextBeforeLeave).toMatch(/\d+%/);
    expect(senderFileRowTextBeforeLeave).not.toContain("finished");
    expect(receiverPanelText).not.toContain(fixture.fileName);
    expect(receiverJoinDisabled).toBe(false);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      senderFileRowTextBeforeLeave: senderFileRowTextBeforeLeave.trim(),
      receiverPanelText: receiverPanelText.trim(),
      senderFileRowText: senderFileRowText.trim(),
      receiverJoinDisabled,
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
