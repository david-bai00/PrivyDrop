import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp, senderStatus, waitForText } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";
import { findAvailableShortRoomId } from "../helpers/roomIds";

const ROOM_AVAILABLE_TEXT = "Room is available";
const DUPLICATE_TEXT = "This room ID is already in use. Please choose another ID.";

test("creates and joins a custom short sender room id", async ({
  browser,
  request,
}, testInfo) => {
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
    const senderRoomInput = page.getByTestId("sender-room-id-input");
    const senderJoinButton = page.getByTestId("sender-join-room-button");
    const senderLeaveButton = page.getByTestId("sender-leave-room-button");
    const senderSyncButton = page.getByTestId("sender-sync-button");

    const customRoomId = await findAvailableShortRoomId(request);
    await senderRoomInput.fill(customRoomId);
    await expect(senderPanel).toContainText(ROOM_AVAILABLE_TEXT, {
      timeout: E2E_TIMEOUT.medium,
    });

    await senderJoinButton.click();

    await waitForText(senderPanel, "Successfully joined the room!", E2E_TIMEOUT.long);
    await waitForText(senderStatus(page), "You're the only one here", E2E_TIMEOUT.long);

    await expect(senderRoomInput).toHaveValue(customRoomId);
    await expect(senderJoinButton).toBeDisabled();
    await expect(senderLeaveButton).toBeEnabled();
    await expect(senderSyncButton).toBeDisabled();
    await expect(senderPanel).not.toContainText(DUPLICATE_TEXT);
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      customRoomId,
      senderPanelText: ((await senderPanel.textContent()) ?? "").trim(),
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
