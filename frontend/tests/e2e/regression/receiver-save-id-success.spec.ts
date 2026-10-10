import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";

test("saves the receiver room id as my room without auto-joining", async ({
  browser,
}, testInfo) => {
  const roomIdToSave = `e2e-room-to-save-${Date.now()}`;
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
    await page.getByTestId("retrieve-tab-button").click();

    const receiverPanel = page.getByTestId("retrieve-panel");
    const receiverStatus = page.getByTestId("receiver-room-status");
    const receiverInput = page.getByTestId("receiver-room-id-input");
    const receiverJoinButton = page.getByTestId("receiver-join-room-button");
    const saveButton = page.getByRole("button", { name: "Save as my room" });

    await receiverInput.fill("short");
    // Short IDs are not cacheable, so the save affordance stays hidden.
    await expect(saveButton).toHaveCount(0);

    await receiverInput.fill(roomIdToSave);
    await expect(saveButton).toBeVisible({ timeout: E2E_TIMEOUT.short });

    await saveButton.click();
    await expect(receiverPanel).toContainText("Saved as my room", {
      timeout: E2E_TIMEOUT.short,
    });
    await expect(page.getByRole("button", { name: "Fill in my room" })).toBeVisible({
      timeout: E2E_TIMEOUT.short,
    });
    // The input already holds the saved room, so saving again is a no-op.
    await expect(saveButton).toBeDisabled();
    await expect(receiverJoinButton).toBeEnabled();
    await expect(receiverStatus).toContainText("You can accept an invitation to join the room", {
      timeout: E2E_TIMEOUT.long,
    });

    const storedCachedId = await page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY);
    expect(storedCachedId).toBe(roomIdToSave);
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomIdToSave,
      storedCachedId,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
