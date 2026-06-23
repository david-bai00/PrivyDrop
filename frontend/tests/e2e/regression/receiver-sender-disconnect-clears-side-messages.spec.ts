import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinSender,
  openClipboardApp,
  receiverStatus,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

test("clears stale receiver side messages after the sender disconnects", async ({
  browser,
}, testInfo) => {
  const roomId = `disconnect-room-${Date.now()}`;
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
    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.long);

    await receiverPage.getByTestId("retrieve-tab-button").click();
    await receiverPage.getByTestId("receiver-room-id-input").fill(roomId);
    await receiverPage.getByTestId("receiver-join-room-button").click();
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);

    const receiverPanel = receiverPage.getByTestId("retrieve-panel");
    const receiverPanelTextBeforeLeave = ((await receiverPanel.textContent()) ?? "").trim();

    await senderPage.getByTestId("sender-leave-room-button").click();
    await waitForText(receiverStatus(receiverPage), "Sender disconnected", E2E_TIMEOUT.long);

    const staleMessages = [
      "Connected",
      "Successfully joined the room!",
      "In the room—establishing a direct P2P connection…",
      "Reconnecting…",
      "Connection restored",
      "Saved to cache",
      "The room you are trying to join does not exist. Only the sender can create a room.",
    ];

    await expect
      .poll(
        async () => {
          const text = ((await receiverPanel.textContent()) ?? "").trim();
          return staleMessages.every((message) => !text.includes(message)) ? text : null;
        },
        {
          timeout: E2E_TIMEOUT.long,
          message: "expected receiver stale side messages to clear after sender disconnect",
        }
      )
      .not.toBeNull();

    const receiverPanelTextAfterLeave = ((await receiverPanel.textContent()) ?? "").trim();

    expect(receiverPanelTextAfterLeave).toContain("Sender disconnected");
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      receiverPanelTextBeforeLeave,
      receiverPanelTextAfterLeave,
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
