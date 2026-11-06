import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp, senderStatus, waitForText } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";

test("fills the cached sender room id without joining until the user clicks join", async ({
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
    const roomIdInput = page.getByTestId("sender-room-id-input");

    await roomIdInput.fill(cachedRoomId);
    await page.getByRole("button", { name: "Save as my room" }).click();
    await waitForText(senderPanel, "Saved as my room", E2E_TIMEOUT.short);

    await expect
      .poll(
        async () => await page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY),
        { timeout: E2E_TIMEOUT.short }
      )
      .toBe(cachedRoomId);

    await page.reload({ waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Fill in my room" }).click();
    await expect(roomIdInput).toHaveValue(cachedRoomId, { timeout: E2E_TIMEOUT.short });
    await expect(
      page.getByRole("button", { name: "Save as my room" })
    ).toBeDisabled();

    // Filling the input is local only: the sender is not in a room yet.
    await expect(page.getByTestId("sender-join-room-button")).toBeEnabled();
    await expect(page.getByTestId("sender-leave-room-button")).toBeDisabled();
    await expect(page.getByTestId("send-panel")).not.toContainText("Connected");

    await page.getByTestId("sender-join-room-button").click();
    await waitForText(senderStatus(page), "You're the only one here", E2E_TIMEOUT.long);
    await expect(page.getByTestId("sender-join-room-button")).toBeDisabled();
    await expect(page.getByTestId("sender-leave-room-button")).toBeEnabled();
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      cachedRoomId,
      storedCachedId: await page.evaluate((key) => window.localStorage.getItem(key), CACHE_KEY),
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
