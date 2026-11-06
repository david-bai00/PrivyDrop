import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp } from "../helpers/clipboardApp";
import { E2E_SERVER_URLS, E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";

/**
 * Regression guard for the "Save as my room" button appearing on a room id
 * that is already the saved room.
 *
 * The unit suite pins the decision table, but the reported bug is a rendered
 * one: a button that looks actionable next to Join while the input already
 * holds my room. Both tabs are covered because the shared button is fed by two
 * different input sources.
 */
test("keeps save-as-my-room visible but disabled once the input already is my room", async ({
  browser,
}, testInfo) => {
  const savedRoomId = `e2e-saved-room-${Date.now()}`;
  const otherRoomId = `e2e-other-room-${Date.now()}`;
  const consoleErrors: string[] = [];

  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, cachedValue }) => {
      window.localStorage.setItem(key, cachedValue);
    },
    { key: CACHE_KEY, cachedValue: savedRoomId }
  );

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    await openClipboardApp(page);

    const senderInput = page.getByTestId("sender-room-id-input");
    const senderSaveButton = page.getByTestId("sender-save-room-id-button");

    // Sender tab: the input already holds my saved room, so saving is a no-op.
    await senderInput.fill(savedRoomId);
    await expect(senderSaveButton).toBeVisible();
    await expect(senderSaveButton).toBeDisabled();

    // Filling from the cache lands in the same state and must stay disabled.
    await senderInput.fill("");
    await page.getByRole("button", { name: "Fill in my room" }).click();
    await expect(senderInput).toHaveValue(savedRoomId);
    await expect(senderSaveButton).toBeDisabled();

    // A different long room id is a real action, so the button comes back.
    await senderInput.fill(otherRoomId);
    await expect(senderSaveButton).toBeEnabled();

    // Receiver tab: the cached id is prefilled, so the same state must hold.
    await page.getByTestId("retrieve-tab-button").click();
    const receiverInput = page.getByTestId("receiver-room-id-input");
    const receiverSaveButton = page.getByTestId("receiver-save-room-id-button");

    await expect(receiverInput).toHaveValue(savedRoomId, {
      timeout: E2E_TIMEOUT.short,
    });
    await expect(receiverSaveButton).toBeVisible();
    await expect(receiverSaveButton).toBeDisabled();

    // The saved room must survive the visit untouched.
    await expect(receiverInput).toHaveValue(savedRoomId);
    await page.waitForTimeout(800);
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY)
    ).toBe(savedRoomId);

    // And the button becomes available again as soon as the input differs.
    await receiverInput.fill(otherRoomId);
    await expect(receiverSaveButton).toBeEnabled();

    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      savedRoomId,
      otherRoomId,
      storedCachedId: await page.evaluate(
        (key) => window.localStorage.getItem(key),
        CACHE_KEY
      ),
      frontendUrl: E2E_SERVER_URLS.frontendUrl,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
