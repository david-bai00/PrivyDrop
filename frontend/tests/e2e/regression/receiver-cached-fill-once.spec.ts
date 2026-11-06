import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp, receiverStatus } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";

/**
 * Regression guard for the "cached id springs back after clearing" bug.
 *
 * Playwright's fill() replaces the whole value in one step, so it never passes
 * through the empty state. Real users select-all and delete, which does. The
 * assertion below therefore drives the field character by character down to
 * empty and holds it there.
 */
test("fills the cached room id once and never restores it after the user clears it", async ({
  browser,
}, testInfo) => {
  const cachedRoomId = `e2e-cached-fill-once-${Date.now()}`;
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
    await openClipboardApp(page);
    await page.getByTestId("retrieve-tab-button").click();

    const receiverInput = page.getByTestId("receiver-room-id-input");
    const receiverJoinButton = page.getByTestId("receiver-join-room-button");

    await expect(receiverInput).toHaveValue(cachedRoomId, { timeout: E2E_TIMEOUT.short });
    await expect(receiverJoinButton).toBeEnabled();
    await expect(page.getByTestId("receiver-leave-room-button")).toBeDisabled();

    // Clear down to the empty state, the way a user does it.
    await receiverInput.click();
    await receiverInput.press("ControlOrMeta+a");
    for (let i = 0; i < cachedRoomId.length; i += 1) {
      await receiverInput.press("Backspace");
    }
    await expect(receiverInput).toHaveValue("");

    // Hold the empty state: the cached id must not spring back and must not join.
    await page.waitForTimeout(1500);
    await expect(receiverInput).toHaveValue("");
    await expect(receiverJoinButton).toBeDisabled();
    await expect(page.getByTestId("receiver-leave-room-button")).toBeDisabled();
    await expect(receiverStatus(page)).toContainText(
      "You can accept an invitation to join the room",
      { timeout: E2E_TIMEOUT.long }
    );
    await expect(page.getByTestId("retrieve-panel")).not.toContainText("Connected");

    // The inline clear affordance is available again whenever the field has a value.
    await receiverInput.fill("ABCD");
    await page.getByTestId("receiver-room-id-clear").click();
    await expect(receiverInput).toHaveValue("");
    await page.waitForTimeout(800);
    await expect(receiverInput).toHaveValue("");

    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      cachedRoomId,
      storedCachedId: await page.evaluate(
        (key) => window.localStorage.getItem(key),
        CACHE_KEY
      ),
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
