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
import {
  getMockFileSize,
  installMockSaveDirectory,
} from "../helpers/mockSaveDirectory";
import { waitForTransferStart } from "../helpers/reconnect";

function isExpectedDisconnectNoise(text: string) {
  return (
    text.includes("ERR_INTERNET_DISCONNECTED") ||
    text.includes("WebSocket connection to") ||
    (text.includes("[Transfer.NetworkTransmitter]") &&
      (text.includes("data_channel_not_ready") ||
        text.includes("embedded_chunk_send_failed") ||
        text.includes("single_data_send_failed"))) ||
    (text.includes("Error in apiCall for URL:") && text.includes("/api/logs_debug"))
  );
}

test("preserves receiver state after the sender leaves during transfer", async ({
  browser,
}, testInfo) => {
  const fixture = createAsciiTextFixture(
    testInfo,
    "peer-disconnect-state.txt",
    64 * 1024 * 1024,
    "PrivyDrop E2E peer disconnect state fixture"
  );
  const roomId = `e2e-peer-disconnect-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await senderContext.addInitScript(() => {
    window.confirm = () => true;
  });
  await installMockSaveDirectory(receiverContext, { mode: "memory" });

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
    await chooseSaveLocation(receiverPage);
    await requestFileFromReceiver(receiverPage, fixture.fileName);

    const senderFileRow = fileRow(senderPage, fixture.fileName);
    await waitForTransferStart(senderFileRow);
    const senderRowTextBeforeDisconnect = (await senderFileRow.textContent()) ?? "";

    await senderPage.getByTestId("sender-leave-room-button").click();

    await waitForText(senderRoomStatus, "Room is empty", E2E_TIMEOUT.medium);
    await waitForText(receiverRoomStatus, "Sender disconnected", E2E_TIMEOUT.medium);
    await receiverPage.waitForTimeout(1_500);

    const receiverPanelText = (await receiverPanel.textContent()) ?? "";
    const receiverLeaveDisabled = await receiverPage
      .getByTestId("receiver-leave-room-button")
      .isDisabled();
    const receiverJoinDisabled = await receiverPage
      .getByTestId("receiver-join-room-button")
      .isDisabled();
    const partialSizeAfterDisconnect =
      (await getMockFileSize(receiverPage, fixture.fileName)) ?? 0;

    const filteredSenderErrors = senderConsoleErrors.filter(
      (text) => !isExpectedDisconnectNoise(text)
    );
    const filteredReceiverErrors = receiverConsoleErrors.filter(
      (text) => !isExpectedDisconnectNoise(text)
    );

    expect(senderRowTextBeforeDisconnect).toMatch(/\d+%/);
    expect(partialSizeAfterDisconnect).toBeGreaterThan(0);
    expect(partialSizeAfterDisconnect).toBeLessThan(fixture.buffer.length);
    expect(receiverPanelText).toContain(fixture.fileName);
    expect(receiverPanelText).not.toContain(
      "In the room—establishing a direct P2P connection…"
    );
    expect(receiverLeaveDisabled).toBe(false);
    expect(receiverJoinDisabled).toBe(true);
    expect(filteredSenderErrors).toEqual([]);
    expect(filteredReceiverErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      senderRowTextBeforeDisconnect,
      partialSizeAfterDisconnect,
      senderConsoleErrors,
      receiverConsoleErrors,
      filteredSenderErrors,
      filteredReceiverErrors,
      receiverPanelText,
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
