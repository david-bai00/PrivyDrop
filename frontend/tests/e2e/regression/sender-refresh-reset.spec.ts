import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinReceiverWithRetry,
  joinSender,
  openClipboardApp,
  receiverStatus,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

test("resets sender room state after page refresh", async ({ browser }, testInfo) => {
  const roomId = `e2e-sender-refresh-reset-${Date.now()}`;
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
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

    await senderPage.reload({ waitUntil: "networkidle" });

    await waitForText(receiverRoomStatus, "Sender disconnected", E2E_TIMEOUT.medium);
    await senderPage.waitForTimeout(1_500);

    const refreshedSenderStatus =
      (await senderPage.getByTestId("sender-room-status").textContent()) ?? "";
    const senderBodyText = (await senderPage.locator("body").textContent()) ?? "";
    const receiverPanelText = (await receiverPanel.textContent()) ?? "";
    const receiverLeaveDisabled = await receiverPage
      .getByTestId("receiver-leave-room-button")
      .isDisabled();
    const receiverJoinDisabled = await receiverPage
      .getByTestId("receiver-join-room-button")
      .isDisabled();

    expect(refreshedSenderStatus).toContain("Room is empty");
    expect(senderBodyText).toContain("Share Content");
    expect(receiverPanelText).toContain("Sender disconnected");
    expect(receiverLeaveDisabled).toBe(false);
    expect(receiverJoinDisabled).toBe(true);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      refreshedSenderStatus: refreshedSenderStatus.trim(),
      receiverPanelText: receiverPanelText.trim(),
      receiverLeaveDisabled,
      receiverJoinDisabled,
      senderBodyIncludesShareContent: senderBodyText.includes("Share Content"),
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
