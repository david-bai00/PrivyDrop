import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  openClipboardApp,
  receiverStatus,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";

test("preserves manual receiver input instead of re-triggering cached auto join", async ({
  browser,
}, testInfo) => {
  const cachedRoomId = `e2e-cached-room-${Date.now()}`;
  const manualRoomId = `manual-room-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await receiverContext.addInitScript(
    ({ key, cachedValue }) => {
      window.localStorage.setItem(key, cachedValue);
    },
    { key: CACHE_KEY, cachedValue: cachedRoomId }
  );

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

    await senderPage.getByTestId("sender-room-id-input").fill(cachedRoomId);
    await senderPage.getByTestId("sender-join-room-button").click();
    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.long);

    await receiverPage.getByTestId("retrieve-tab-button").click();
    await expect(receiverPage.getByTestId("receiver-room-id-input")).toHaveValue(cachedRoomId, {
      timeout: E2E_TIMEOUT.short,
    });
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);
    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);

    await receiverPage.getByTestId("receiver-leave-room-button").click();
    await waitForText(
      receiverStatus(receiverPage),
      "You can accept an invitation to join the room",
      E2E_TIMEOUT.medium
    );
    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.medium);

    const receiverRoomIdInput = receiverPage.getByTestId("receiver-room-id-input");
    await receiverRoomIdInput.fill(manualRoomId);
    await receiverPage.getByTestId("send-tab-button").click();
    await receiverPage.getByTestId("retrieve-tab-button").click();
    await receiverPage.waitForTimeout(1200);

    await expect(receiverRoomIdInput).toHaveValue(manualRoomId);
    await expect(receiverPage.getByTestId("receiver-join-room-button")).toBeEnabled();
    await expect(receiverPage.getByTestId("receiver-leave-room-button")).toBeDisabled();
    await expect(receiverPage.getByTestId("retrieve-panel")).not.toContainText("Connected");
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      cachedRoomId,
      manualRoomId,
      receiverPanelText: (
        (await receiverPage.getByTestId("retrieve-panel").textContent()) ?? ""
      ).trim(),
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
