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

test("returns both peers to a clean idle state after concurrent leave", async ({
  browser,
}, testInfo) => {
  const probeText = "phase5 concurrent leave";
  const roomId = `e2e-concurrent-leave-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  senderPage.on("console", (message) => {
    if (message.type() === "error") {
      senderConsoleErrors.push(message.text());
    }
  });
  receiverPage.on("console", (message) => {
    if (message.type() === "error") {
      receiverConsoleErrors.push(message.text());
    }
  });

  try {
    await Promise.all([openClipboardApp(senderPage), openClipboardApp(receiverPage)]);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    const senderRoomStatus = senderStatus(senderPage);
    const receiverRoomStatus = receiverStatus(receiverPage);
    const senderPanel = senderPage.getByTestId("send-panel");
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");
    const senderEditor = senderPage.locator('[contenteditable="true"]').first();

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await senderEditor.fill(probeText);
    await senderPage.getByTestId("sender-sync-button").click();
    await waitForText(receiverPanel, probeText, E2E_TIMEOUT.long);

    await Promise.all([
      senderPage.getByTestId("sender-leave-room-button").click(),
      receiverPage.getByTestId("receiver-leave-room-button").click(),
    ]);

    await waitForText(senderRoomStatus, "Room is empty", E2E_TIMEOUT.medium);
    await expect(senderPage.getByTestId("sender-join-room-button")).toBeEnabled({
      timeout: E2E_TIMEOUT.medium,
    });
    await expect(receiverPage.getByTestId("receiver-join-room-button")).toBeEnabled({
      timeout: E2E_TIMEOUT.medium,
    });

    const senderPanelText = ((await senderPanel.textContent()) ?? "").trim();
    const receiverPanelText = ((await receiverPanel.textContent()) ?? "").trim();

    expect(senderPanelText).not.toContain("2 People in the room");
    expect(receiverPanelText).not.toContain("Connected");
    expect(receiverPanelText).not.toContain(probeText);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      probeText,
      senderPanelText,
      receiverPanelText,
      senderConsoleErrors,
      receiverConsoleErrors,
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
