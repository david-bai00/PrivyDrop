import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp, waitForText } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";

test("keeps the current sender input unchanged when cached-id save mode times out", async ({
  browser,
}, testInfo) => {
  const cachedRoomId = `cached-room-${Date.now()}`;
  const consoleErrors: string[] = [];

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    await openClipboardApp(page);

    const senderPanel = page.getByTestId("send-panel");
    const senderInput = page.getByTestId("sender-room-id-input");
    const saveIdButton = page.getByRole("button", { name: "Save ID" });

    await senderInput.fill(cachedRoomId);
    await saveIdButton.click();
    await waitForText(senderPanel, "Saved to cache", E2E_TIMEOUT.short);

    await expect
      .poll(
        async () => page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY),
        { timeout: E2E_TIMEOUT.short }
      )
      .toBe(cachedRoomId);

    await page.reload({ waitUntil: "networkidle" });
    await expect(senderInput).not.toHaveValue("", {
      timeout: E2E_TIMEOUT.long,
    });

    const reloadedInputValue = (await senderInput.inputValue()).trim();

    const useCachedButton = page.getByRole("button", { name: "Use cached ID" });
    await useCachedButton.dblclick();

    const saveOverrideButton = page.getByRole("button", { name: "Save ID" });
    await expect(saveOverrideButton).toBeVisible({ timeout: E2E_TIMEOUT.short });

    await page.waitForTimeout(700);
    await expect(senderInput).toHaveValue(reloadedInputValue);

    await expect(useCachedButton).toBeVisible({ timeout: 5_000 });
    await expect(senderInput).toHaveValue(reloadedInputValue);

    const storedCachedId = await page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY);

    expect(storedCachedId).toBe(cachedRoomId);
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      cachedRoomId,
      reloadedInputValue,
      storedCachedId,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
