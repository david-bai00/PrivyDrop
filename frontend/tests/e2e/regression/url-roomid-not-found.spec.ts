import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { E2E_SERVER, E2E_SERVER_URLS, E2E_TIMEOUT } from "../helpers/e2eConfig";

const NOT_FOUND_TEXT =
  "The room you are trying to join does not exist. Only the sender can create a room.";

test("stays on the retrieve tab and keeps retry affordances when URL auto-join hits notFound", async ({
  browser,
}, testInfo) => {
  const missingRoomId = `missing-from-url-${Date.now()}`;
  const consoleErrors: string[] = [];

  const context = await browser.newContext();
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

    await expect(receiverInput).toHaveValue(missingRoomId, { timeout: E2E_TIMEOUT.short });
    await expect(receiverPanel).toContainText(NOT_FOUND_TEXT, { timeout: E2E_TIMEOUT.long });
    await expect(receiverStatus).toContainText(
      "You can accept an invitation to join the room",
      { timeout: E2E_TIMEOUT.long }
    );

    await expect(page.getByTestId("retrieve-tab-button")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(receiverJoinButton).toBeEnabled();
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      missingRoomId,
      receiverUrl,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
