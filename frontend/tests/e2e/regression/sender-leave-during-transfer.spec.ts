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
import { waitForTransferStart } from "../helpers/reconnect";

test("returns both peers to a sane state when the sender leaves during transfer", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "sender-leave.txt",
    128 * 1024 * 1024,
    "PrivyDrop E2E sender leave during transfer fixture"
  );
  const roomId = `e2e-sender-leave-${Date.now()}`;

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await senderContext.addInitScript(() => {
    window.confirm = () => true;
  });
  await receiverContext.addInitScript(() => {
    const testWindow = window as any;
    testWindow.__downloadRecords = [];

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        testWindow.__downloadRecords.push({ name: this.download });
      }
      return originalClick.call(this);
    };
  });

  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  try {
    await Promise.all([openClipboardApp(senderPage), openClipboardApp(receiverPage)]);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    const senderRoomStatus = senderStatus(senderPage);
    const receiverRoomStatus = receiverStatus(receiverPage);

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await waitForText(receiverPage.getByTestId("retrieve-panel"), fixture.fileName, E2E_TIMEOUT.long);

    const senderRow = fileRow(senderPage, fixture.fileName);
    const receiverRow = fileRow(receiverPage, fixture.fileName);

    await requestFileFromReceiver(receiverPage, fixture.fileName);
    await waitForTransferStart(senderRow);
    const senderRowTextBeforeLeave = (await senderRow.textContent()) ?? "";
    const firstObservedProgress = Number(
      senderRowTextBeforeLeave.match(/(\d+)%/)?.[1] ?? "0"
    );

    await senderPage.getByTestId("sender-leave-room-button").click();

    await waitForText(senderRoomStatus, "Room is empty", E2E_TIMEOUT.medium);
    await waitForText(receiverRoomStatus, "Sender disconnected", E2E_TIMEOUT.medium);

    const senderPanelText = (await senderPage.getByTestId("send-panel").textContent()) ?? "";
    const receiverRowText = (await receiverRow.textContent()) ?? "";
    const downloadRecordCount = await receiverPage.evaluate(
      () => ((window as any).__downloadRecords ?? []).length
    );

    expect(firstObservedProgress).toBeGreaterThan(0);
    expect(senderPanelText).toContain("Join room");
    expect(receiverRowText).toContain(fixture.fileName);
    expect(downloadRecordCount).toBe(0);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      firstObservedProgress,
      senderRowTextBeforeLeave: senderRowTextBeforeLeave.trim(),
      senderPanelText: senderPanelText.trim(),
      receiverRowText: receiverRowText.trim(),
      downloadRecordCount,
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
