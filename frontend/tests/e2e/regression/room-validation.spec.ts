import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  openClipboardApp,
  receiverStatus,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const NOT_FOUND_TEXT =
  "The room you are trying to join does not exist. Only the sender can create a room.";

test("keeps join actions disabled for empty room IDs and shows notFound feedback for invalid rooms", async ({
  browser,
}, testInfo) => {
  const invalidRoomId = `e2e-missing-room-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  senderPage.on("console", (message) => {
    if (message.type() === "error") {
      senderConsoleErrors.push(message.text());
    }
  });
  receiverPage.on("console", (message) => {
    if (message.type() === "error") {
      receiverConsoleErrors.push(message.text());
    }
  });

  try {
    await Promise.all([openClipboardApp(senderPage), openClipboardApp(receiverPage)]);

    const senderJoinButton = senderPage.getByTestId("sender-join-room-button");
    const senderRoomInput = senderPage.getByTestId("sender-room-id-input");

    await senderRoomInput.fill("");
    await expect(senderJoinButton).toBeDisabled();

    await receiverPage.getByTestId("retrieve-tab-button").click();
    const receiverJoinButton = receiverPage.getByTestId("receiver-join-room-button");
    const receiverRoomInput = receiverPage.getByTestId("receiver-room-id-input");
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");

    await expect(receiverJoinButton).toBeDisabled();

    await receiverRoomInput.fill(invalidRoomId);
    await receiverJoinButton.click();

    await waitForText(receiverPanel, NOT_FOUND_TEXT, E2E_TIMEOUT.long);
    await waitForText(
      receiverStatus(receiverPage),
      "You can accept an invitation to join the room",
      E2E_TIMEOUT.medium
    );

    await expect(receiverJoinButton).toBeEnabled();
    await expect(senderStatus(senderPage)).toContainText("Room is empty");

    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      invalidRoomId,
      senderConsoleErrors,
      receiverConsoleErrors,
    });
  } finally {
    await Promise.allSettled([
      senderPage.close(),
      receiverPage.close(),
      senderContext.close(),
      receiverContext.close(),
    ]);
  }
});
