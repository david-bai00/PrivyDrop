import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { E2E_SERVER, E2E_SERVER_URLS, E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";
const NOT_FOUND_TEXT =
  "The room you are trying to join does not exist. Only the sender can create a room.";

test("fills the receiver input from cache without auto-joining after a notFound URL join", async ({
  browser,
}, testInfo) => {
  const cachedRoomId = `e2e-cached-room-${Date.now()}`;
  const missingRoomId = `missing-room-${Date.now()}`;
  const consoleErrors: string[] = [];

  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, cachedValue }) => {
      window.localStorage.setItem(key, cachedValue);
    },
    { key: CACHE_KEY, cachedValue: cachedRoomId }
  );

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    const receiverUrl = `${E2E_SERVER_URLS.frontendUrl}${E2E_SERVER.localePath}?roomId=${encodeURIComponent(missingRoomId)}`;
    await page.goto(receiverUrl, { waitUntil: "networkidle" });

    const receiverInput = page.getByTestId("receiver-room-id-input");
    const receiverStatus = page.getByTestId("receiver-room-status");
    const receiverPanel = page.getByTestId("retrieve-panel");

    await expect(receiverInput).toHaveValue(missingRoomId, { timeout: E2E_TIMEOUT.short });
    await expect(receiverPanel).toContainText(NOT_FOUND_TEXT, { timeout: E2E_TIMEOUT.long });
    await expect(receiverStatus).toContainText("You can accept an invitation to join the room", {
      timeout: E2E_TIMEOUT.long,
    });

    await page.getByRole("button", { name: "Use cached ID" }).click();
    await expect(receiverInput).toHaveValue(cachedRoomId, { timeout: E2E_TIMEOUT.short });
    await expect(receiverStatus).toContainText("You can accept an invitation to join the room");
    await expect(page.getByTestId("receiver-join-room-button")).toBeEnabled();
    await expect(page.getByTestId("receiver-leave-room-button")).toBeDisabled();

    const storedCachedId = await page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY);
    expect(storedCachedId).toBe(cachedRoomId);
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      cachedRoomId,
      missingRoomId,
      receiverUrl,
      storedCachedId,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
