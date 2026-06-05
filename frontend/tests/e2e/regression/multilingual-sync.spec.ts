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

test("syncs multilingual published text to the receiver", async ({ browser }, testInfo) => {
  const multilingualText = "Hello 你好 مرحبا PrivyDrop";
  const roomId = `e2e-multilingual-sync-${Date.now()}`;
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
    const senderEditor = senderPage.locator('[contenteditable="true"]').first();
    const senderPanel = senderPage.getByTestId("send-panel");
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await senderEditor.fill(multilingualText);
    await senderPage.getByTestId("sender-sync-button").click();
    await waitForText(receiverPanel, multilingualText, E2E_TIMEOUT.long);

    const senderPanelText = ((await senderPanel.textContent()) ?? "").trim();
    const receiverPanelText = ((await receiverPanel.textContent()) ?? "").trim();

    expect(senderPanelText).toContain(multilingualText);
    expect(receiverPanelText).toContain(multilingualText);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      multilingualText,
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
