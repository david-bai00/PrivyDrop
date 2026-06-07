import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { E2E_SERVER, E2E_SERVER_URLS, E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";
const NOT_FOUND_TEXT =
  "The room you are trying to join does not exist. Only the sender can create a room.";

test("overwrites the cached receiver room id from save mode without auto-joining", async ({
  browser,
}, testInfo) => {
  const originalCachedRoomId = `e2e-original-cached-${Date.now()}`;
  const replacementRoomId = `e2e-replacement-room-${Date.now()}`;
  const missingRoomId = `missing-overwrite-${Date.now()}`;
  const consoleErrors: string[] = [];

  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, cachedValue }) => {
      window.localStorage.setItem(key, cachedValue);
    },
    { key: CACHE_KEY, cachedValue: originalCachedRoomId }
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

    const receiverPanel = page.getByTestId("retrieve-panel");
    const receiverStatus = page.getByTestId("receiver-room-status");
    const receiverInput = page.getByTestId("receiver-room-id-input");
    const receiverJoinButton = page.getByTestId("receiver-join-room-button");
    const useCachedButton = page.getByRole("button", { name: "Use cached ID" });

    await expect(receiverInput).toHaveValue(missingRoomId, { timeout: E2E_TIMEOUT.short });
    await expect(receiverPanel).toContainText(NOT_FOUND_TEXT, { timeout: E2E_TIMEOUT.long });

    await useCachedButton.dblclick();
    const saveOverrideButton = page.getByRole("button", { name: "Save ID" });
    await expect(saveOverrideButton).toBeVisible({ timeout: E2E_TIMEOUT.short });

    await receiverInput.fill(replacementRoomId);
    await saveOverrideButton.click();

    await expect(receiverPanel).toContainText("Saved to cache", {
      timeout: E2E_TIMEOUT.short,
    });
    await expect(useCachedButton).toBeVisible({ timeout: 5_000 });
    await expect(receiverInput).toHaveValue(replacementRoomId);
    await expect(receiverJoinButton).toBeEnabled();
    await expect(receiverStatus).toContainText("You can accept an invitation to join the room", {
      timeout: E2E_TIMEOUT.long,
    });

    const storedCachedId = await page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY);
    expect(storedCachedId).toBe(replacementRoomId);
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      originalCachedRoomId,
      replacementRoomId,
      missingRoomId,
      receiverUrl,
      storedCachedId,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
