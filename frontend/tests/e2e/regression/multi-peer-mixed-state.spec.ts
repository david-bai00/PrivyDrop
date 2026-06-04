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
  senderPanel: Locator,
  receiverARoomStatus: Locator,
  receiverBRoomStatus: Locator,
  receiverBPanel: Locator
) {
  const [
    senderText,
    senderPanelText,
    receiverAText,
    receiverBText,
    receiverBPanelText,
  ] = await Promise.all([
    senderRoomStatus.textContent(),
    senderPanel.textContent(),
    receiverARoomStatus.textContent(),
    receiverBRoomStatus.textContent(),
    receiverBPanel.textContent(),
  ]);

  return {
    senderStatus: (senderText ?? "").trim(),
    senderPanel: (senderPanelText ?? "").trim(),
    receiverAStatus: (receiverAText ?? "").trim(),
    receiverBStatus: (receiverBText ?? "").trim(),
    receiverBPanel: (receiverBPanelText ?? "").trim(),
  };
}

test("keeps peer A healthy while peer B drops offline and returns", async ({
  browser,
}, testInfo) => {
  const roomId = `e2e-multi-peer-mixed-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverAConsoleErrors: string[] = [];
  const receiverBConsoleErrors: string[] = [];
  const mixedStateSnapshots: Array<
    Awaited<ReturnType<typeof captureStatusSnapshot>> & { step: number }
  > = [];
  const recoverySnapshots: Array<
    Awaited<ReturnType<typeof captureStatusSnapshot>> & { step: number }
  > = [];

  const senderContext = await browser.newContext();
  const receiverAContext = await browser.newContext();
  const receiverBContext = await browser.newContext();
  const senderPage = await senderContext.newPage();
  const receiverAPage = await receiverAContext.newPage();
  const receiverBPage = await receiverBContext.newPage();

  senderPage.on("console", (message) => {
    if (message.type() === "error") {
      senderConsoleErrors.push(message.text());
    }
  });
  receiverAPage.on("console", (message) => {
    if (message.type() === "error") {
      receiverAConsoleErrors.push(message.text());
    }
  });
  receiverBPage.on("console", (message) => {
    if (message.type() === "error") {
      receiverBConsoleErrors.push(message.text());
    }
  });

  try {
    await Promise.all([
      openClipboardApp(senderPage),
      openClipboardApp(receiverAPage),
      openClipboardApp(receiverBPage),
    ]);

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverAPage, roomId);
    await receiverAPage.waitForTimeout(15_000);
    await joinReceiverWithRetry(receiverBPage, roomId);

    const senderRoomStatus = senderStatus(senderPage);
    const senderPanel = senderPage.getByTestId("send-panel");
    const receiverARoomStatus = receiverStatus(receiverAPage);
    const receiverBRoomStatus = receiverStatus(receiverBPage);
    const receiverBPanel = receiverBPage.getByTestId("retrieve-panel");

    await waitForText(senderRoomStatus, "3 People in the room", E2E_TIMEOUT.long);
    await Promise.all([
      waitForText(receiverARoomStatus, "Connected", E2E_TIMEOUT.long),
      waitForText(receiverBRoomStatus, "Connected", E2E_TIMEOUT.long),
    ]);

    await receiverBContext.setOffline(true);

    let observedMixedState = false;
    for (let step = 1; step <= 10; step += 1) {
      await receiverBPage.waitForTimeout(5_000);
      const snapshot = await captureStatusSnapshot(
        senderRoomStatus,
        senderPanel,
        receiverARoomStatus,
        receiverBRoomStatus,
        receiverBPanel
      );
      mixedStateSnapshots.push({ step, ...snapshot });

      const receiverBMixedStateOk =
        snapshot.receiverBPanel.includes("Reconnecting") ||
        snapshot.receiverBStatus.includes("Sender disconnected") ||
        snapshot.receiverBStatus.includes("Connected");

      if (
        snapshot.senderStatus.includes("2 People in the room") &&
        snapshot.receiverAStatus.includes("Connected") &&
        receiverBMixedStateOk &&
        !snapshot.senderPanel.includes("Reconnecting") &&
        !snapshot.receiverBPanel.includes("Connection restored")
      ) {
        observedMixedState = true;
        break;
      }
    }

    await receiverBContext.setOffline(false);

    let observedRecovered = false;
    for (let step = 1; step <= 8; step += 1) {
      await receiverBPage.waitForTimeout(5_000);
      const snapshot = await captureStatusSnapshot(
        senderRoomStatus,
        senderPanel,
        receiverARoomStatus,
        receiverBRoomStatus,
        receiverBPanel
      );
      recoverySnapshots.push({ step, ...snapshot });

      if (
        snapshot.senderStatus.includes("3 People in the room") &&
        snapshot.receiverBStatus.includes("Connected") &&
        !snapshot.receiverBPanel.includes("Reconnecting")
      ) {
        observedRecovered = true;
        break;
      }
    }

    const filteredSenderErrors = senderConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );
    const filteredReceiverAErrors = receiverAConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );
    const filteredReceiverBErrors = receiverBConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );

    expect(observedMixedState).toBe(true);
    expect(observedRecovered).toBe(true);
    expect(filteredSenderErrors).toEqual([]);
    expect(filteredReceiverAErrors).toEqual([]);
    expect(filteredReceiverBErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      mixedStateSnapshots,
      recoverySnapshots,
      senderConsoleErrors,
      receiverAConsoleErrors,
      receiverBConsoleErrors,
      filteredSenderErrors,
      filteredReceiverAErrors,
      filteredReceiverBErrors,
    });
  } finally {
    await Promise.allSettled([
      senderPage.close(),
      receiverAPage.close(),
      receiverBPage.close(),
      senderContext.close(),
      receiverAContext.close(),
      receiverBContext.close(),
    ]);
  }
});
