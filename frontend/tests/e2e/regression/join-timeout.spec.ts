import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinSender,
  openClipboardApp,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const NETWORK_WARNING_TEXTS = [
  "Feels slow—check your network/VPN or try again shortly",
  "Network may be restricted — try turning off VPN or try again shortly",
] as const;

const TIMEOUT_TEXT = "Join timed out (network may be restricted). Please try again";

function isExpectedOfflineNoise(text: string) {
  return (
    text.includes("ERR_INTERNET_DISCONNECTED") ||
    text.includes("WebSocket connection to") ||
    (text.includes("Error in apiCall for URL:") && text.includes("/api/logs_debug"))
  );
}

test("shows a network warning and timeout when a receiver joins while offline", async ({
  browser,
}, testInfo) => {
  const roomId = `e2e-join-timeout-${Date.now()}`;
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

    const senderRoomStatus = senderStatus(senderPage);
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");

    await waitForText(senderRoomStatus, "You're the only one here", E2E_TIMEOUT.long);

    await receiverPage.getByTestId("retrieve-tab-button").click();
    await receiverPage.getByTestId("receiver-room-id-input").fill(roomId);
    await receiverContext.setOffline(true);
    await receiverPage.getByTestId("receiver-join-room-button").click();

    await expect
      .poll(
        async () => {
          const panelText = (await receiverPanel.textContent()) ?? "";
          return NETWORK_WARNING_TEXTS.find((text) => panelText.includes(text)) ?? null;
        },
        { timeout: 20_000 }
      )
      .not.toBeNull();

    const receiverPanelTextAfterWarning = (await receiverPanel.textContent()) ?? "";
    const observedWarning =
      NETWORK_WARNING_TEXTS.find((text) =>
        receiverPanelTextAfterWarning.includes(text)
      ) ?? null;

    await waitForText(receiverPanel, TIMEOUT_TEXT, E2E_TIMEOUT.long);
    await expect
      .poll(async () => (await receiverPanel.textContent()) ?? "", {
        timeout: E2E_TIMEOUT.medium,
      })
      .not.toContain(TIMEOUT_TEXT);

    const filteredSenderErrors = senderConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );
    const filteredReceiverErrors = receiverConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );

    expect(filteredSenderErrors).toEqual([]);
    expect(filteredReceiverErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      observedWarning,
      timeoutText: TIMEOUT_TEXT,
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
