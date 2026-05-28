import { expect, test, type Locator } from "@playwright/test";
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

function isExpectedOfflineNoise(text: string) {
  return (
    text.includes("ERR_INTERNET_DISCONNECTED") ||
    text.includes("WebSocket connection to") ||
    (text.includes("Error in apiCall for URL:") && text.includes("/api/logs_debug"))
  );
}

async function captureStatusSnapshot(
  senderRoomStatus: Locator,
  receiverRoomStatus: Locator,
  receiverPanel: Locator
) {
  const [senderText, receiverText, receiverPanelText] = await Promise.all([
    senderRoomStatus.textContent(),
    receiverRoomStatus.textContent(),
    receiverPanel.textContent(),
  ]);

  return {
    senderStatus: (senderText ?? "").trim(),
    receiverStatus: (receiverText ?? "").trim(),
    receiverPanel: (receiverPanelText ?? "").trim(),
  };
}

test("recovers automatically after the receiver goes offline and returns", async ({
  browser,
}, testInfo) => {
  const roomId = `e2e-offline-reconnect-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];
  const offlineSnapshots: Array<
    Awaited<ReturnType<typeof captureStatusSnapshot>> & { step: number }
  > = [];
  const recoverySnapshots: Array<
    Awaited<ReturnType<typeof captureStatusSnapshot>> & { step: number }
  > = [];

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

    await receiverContext.setOffline(true);

    let observedDisconnected = false;
    for (let step = 1; step <= 10; step += 1) {
      await receiverPage.waitForTimeout(5_000);
      const snapshot = await captureStatusSnapshot(
        senderRoomStatus,
        receiverRoomStatus,
        receiverPanel
      );

      offlineSnapshots.push({ step, ...snapshot });

      if (
        snapshot.receiverStatus.includes("Sender disconnected") ||
        snapshot.senderStatus.includes("You're the only one here")
      ) {
        observedDisconnected = true;
        break;
      }
    }

    await receiverContext.setOffline(false);

    let observedRecovered = false;
    for (let step = 1; step <= 8; step += 1) {
      await receiverPage.waitForTimeout(5_000);
      const snapshot = await captureStatusSnapshot(
        senderRoomStatus,
        receiverRoomStatus,
        receiverPanel
      );

      recoverySnapshots.push({ step, ...snapshot });

      if (
        snapshot.senderStatus.includes("2 People in the room") &&
        snapshot.receiverStatus.includes("Connected") &&
        !snapshot.receiverPanel.includes("Reconnecting")
      ) {
        observedRecovered = true;
        break;
      }
    }

    const filteredSenderErrors = senderConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );
    const filteredReceiverErrors = receiverConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );

    expect(observedDisconnected).toBe(true);
    expect(observedRecovered).toBe(true);
    expect(filteredSenderErrors).toEqual([]);
    expect(filteredReceiverErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      offlineSnapshots,
      recoverySnapshots,
      senderConsoleErrors,
      receiverConsoleErrors,
      filteredSenderErrors,
      filteredReceiverErrors,
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
