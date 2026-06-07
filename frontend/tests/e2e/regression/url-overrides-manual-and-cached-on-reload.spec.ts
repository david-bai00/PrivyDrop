import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp, senderStatus, waitForText } from "../helpers/clipboardApp";
import { E2E_SERVER, E2E_SERVER_URLS, E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";

test("re-applies the URL roomId over manual and cached values after reload", async ({
  browser,
}, testInfo) => {
  const cachedRoomId = `e2e-cached-room-${Date.now()}`;
  const urlRoomId = `e2e-url-room-${Date.now()}-reload`;
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
    await openClipboardApp(senderPage);
    await senderPage.getByTestId("sender-room-id-input").fill(urlRoomId);
    await senderPage.getByTestId("sender-join-room-button").click();
    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.long);

    const receiverUrl = `${E2E_SERVER_URLS.frontendUrl}${E2E_SERVER.localePath}?roomId=${encodeURIComponent(urlRoomId)}`;
    await receiverPage.goto(receiverUrl, { waitUntil: "networkidle" });

    const receiverStatus = receiverPage.getByTestId("receiver-room-status");
    const receiverInput = receiverPage.getByTestId("receiver-room-id-input");

    await expect(receiverInput).toHaveValue(urlRoomId, { timeout: E2E_TIMEOUT.short });
    await waitForText(receiverStatus, "Connected", E2E_TIMEOUT.long);
    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);

    await receiverPage.getByTestId("receiver-leave-room-button").click();
    await waitForText(
      receiverStatus,
      "You can accept an invitation to join the room",
      E2E_TIMEOUT.medium
    );
    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.medium);

    await receiverInput.fill(manualRoomId);
    await expect(receiverInput).toHaveValue(manualRoomId);
    await expect(receiverPage.getByTestId("receiver-join-room-button")).toBeEnabled();

    await receiverPage.reload({ waitUntil: "networkidle" });

    await expect(receiverInput).toHaveValue(urlRoomId, { timeout: E2E_TIMEOUT.short });
    await waitForText(receiverStatus, "Connected", E2E_TIMEOUT.long);
    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);

    const storedCachedId = await receiverPage.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY);

    expect(storedCachedId).toBe(cachedRoomId);
    expect(cachedRoomId).not.toBe(urlRoomId);
    expect(manualRoomId).not.toBe(urlRoomId);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      cachedRoomId,
      urlRoomId,
      manualRoomId,
      receiverUrl,
      storedCachedId,
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
