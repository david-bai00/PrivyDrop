import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  fileRow,
  joinReceiverWithRetry,
  joinSender,
  openClipboardApp,
  receiverStatus,
  senderStatus,
  syncFileFromSender,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";
import { createAsciiTextFixture } from "../helpers/fileFixtures";

test("shows files on the first file-only sync and keeps them after a later text sync", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "file-only-then-text-sync.txt",
    4 * 1024,
    "PrivyDrop file-only then text sync fixture"
  );
  const followupText = "follow-up text after file-only sync";
  const roomId = `e2e-file-only-then-text-${Date.now()}`;
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
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");
    const senderEditor = senderPage.locator('[contenteditable="true"]').first();

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await expect(fileRow(receiverPage, fixture.fileName)).toBeVisible({
      timeout: E2E_TIMEOUT.long,
    });
    await waitForText(receiverPanel, fixture.fileName, E2E_TIMEOUT.long);

    await senderEditor.fill(followupText);
    await senderPage.getByTestId("sender-sync-button").click();

    await expect(fileRow(receiverPage, fixture.fileName)).toBeVisible({
      timeout: E2E_TIMEOUT.long,
    });
    await waitForText(receiverPanel, fixture.fileName, E2E_TIMEOUT.long);
    await waitForText(receiverPanel, followupText, E2E_TIMEOUT.long);

    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      followupText,
      senderPanelText: ((await senderPage.getByTestId("send-panel").textContent()) ?? "").trim(),
      receiverPanelText: ((await receiverPanel.textContent()) ?? "").trim(),
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
