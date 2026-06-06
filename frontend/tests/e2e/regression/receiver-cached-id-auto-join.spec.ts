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

test("auto-joins the receiver from a cached room id", async ({ browser }, testInfo) => {
  const roomId = `e2e-receiver-cached-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await receiverContext.addInitScript(
    ({ key, cachedRoomId }) => {
      window.localStorage.setItem(key, cachedRoomId);
    },
    { key: CACHE_KEY, cachedRoomId: roomId }
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
    await openClipboardApp(senderPage);
    await senderPage.getByTestId("sender-room-id-input").fill(roomId);
    await senderPage.getByTestId("sender-join-room-button").click();
    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.long);

    await openClipboardApp(receiverPage);
    await receiverPage.getByTestId("retrieve-tab-button").click();

    await expect(receiverPage.getByTestId("receiver-room-id-input")).toHaveValue(roomId, {
      timeout: E2E_TIMEOUT.short,
    });
    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);
    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);

    await expect(receiverPage.getByTestId("retrieve-tab-button")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(receiverPage.getByTestId("receiver-join-room-button")).toBeDisabled();
    await expect(receiverPage.getByTestId("receiver-leave-room-button")).toBeEnabled();
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      storedCachedId: await receiverPage.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY),
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
