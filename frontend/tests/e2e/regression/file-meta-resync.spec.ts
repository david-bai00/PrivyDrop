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

test("clears receiver file metadata after the sender deletes and re-syncs", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "file-meta-resync.txt",
    4 * 1024,
    "PrivyDrop E2E file metadata resync fixture"
  );
  const roomId = `e2e-file-meta-resync-${Date.now()}`;
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

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await syncFileFromSender(senderPage, fixture.filePath, fixture.fileName);
    await waitForText(receiverPanel, fixture.fileName, E2E_TIMEOUT.long);

    const senderFileRow = fileRow(senderPage, fixture.fileName);
    await senderFileRow.getByRole("button", { name: /Delete/i }).click();
    await expect(senderFileRow).not.toBeVisible({ timeout: E2E_TIMEOUT.long });

    await senderPage.getByTestId("sender-sync-button").click();

    await expect
      .poll(
        async () => ((await receiverPanel.textContent()) ?? "").includes(fixture.fileName),
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(false);

    const senderPanelText = ((await senderPage.getByTestId("send-panel").textContent()) ?? "").trim();
    const receiverPanelText = ((await receiverPanel.textContent()) ?? "").trim();

    expect(receiverPanelText).not.toContain(fixture.fileName);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
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
