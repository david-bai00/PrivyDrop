import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const CACHE_KEY = "pd_cached_room_id_v1";
const NOT_FOUND_TEXT =
  "The room you are trying to join does not exist. Only the sender can create a room.";

test("keeps receiver retry affordances when cached auto-join lands on notFound", async ({
  browser,
}, testInfo) => {
  const cachedRoomId = `e2e-missing-cached-room-${Date.now()}`;
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

    await expect(page.getByTestId("receiver-room-id-input")).toHaveValue(cachedRoomId, {
      timeout: E2E_TIMEOUT.short,
    });
    await expect(page.getByTestId("retrieve-panel")).toContainText(NOT_FOUND_TEXT, {
      timeout: E2E_TIMEOUT.long,
    });
    await expect(page.getByTestId("receiver-room-status")).toContainText(
      "You can accept an invitation to join the room",
      { timeout: E2E_TIMEOUT.long }
    );

    await expect(page.getByTestId("receiver-join-room-button")).toBeEnabled();
    await expect(page.getByTestId("receiver-leave-room-button")).toBeDisabled();
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      cachedRoomId,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
