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

test("clears receiver published text after the sender syncs an empty draft", async ({
  browser,
}, testInfo) => {
  const initialText = "phase3 text publish";
  const roomId = `e2e-text-clear-resync-${Date.now()}`;
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
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await senderEditor.fill(initialText);
    await senderPage.getByTestId("sender-sync-button").click();
    await waitForText(receiverPanel, initialText, E2E_TIMEOUT.long);

    await senderEditor.fill("");
    await senderPage.getByTestId("sender-sync-button").click();

    await expect
      .poll(
        async () => ((await receiverPanel.textContent()) ?? "").includes(initialText),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(false);

    const senderPanelText = ((await senderPage.getByTestId("send-panel").textContent()) ?? "").trim();
    const receiverPanelText = ((await receiverPanel.textContent()) ?? "").trim();

    expect(receiverPanelText).not.toContain(initialText);
    expect(senderPanelText).not.toContain(initialText);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      initialText,
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
