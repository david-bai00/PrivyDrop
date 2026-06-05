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

test("resets receiver room state after page refresh", async ({ browser }, testInfo) => {
  const roomId = `e2e-receiver-refresh-reset-${Date.now()}`;
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

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await receiverPage.reload({ waitUntil: "networkidle" });

    await waitForText(senderRoomStatus, "You're the only one here", E2E_TIMEOUT.medium);
    await receiverPage.waitForTimeout(1_500);

    const receiverSendStatus =
      (await receiverPage.getByTestId("sender-room-status").textContent()) ?? "";
    const retrieveTabState = await receiverPage
      .getByTestId("retrieve-tab-button")
      .getAttribute("data-state");
    const receiverBodyText = (await receiverPage.locator("body").textContent()) ?? "";

    expect(retrieveTabState).not.toBe("active");
    expect(receiverSendStatus).toContain("Room is empty");
    expect(receiverBodyText).toContain("Share Content");

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      receiverSendStatus: receiverSendStatus.trim(),
      retrieveTabState,
      receiverBodyIncludesShareContent: receiverBodyText.includes("Share Content"),
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
