import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinSender,
  openClipboardApp,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const DUPLICATE_TEXT = "This room ID is already in use. Please choose another ID.";

test("keeps the room owner healthy when a second sender tries a duplicate room ID", async ({
  browser,
}, testInfo) => {
  const firstSenderConsoleErrors: string[] = [];
  const secondSenderConsoleErrors: string[] = [];

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  firstPage.on("console", (message) => {
    if (message.type() === "error") {
      firstSenderConsoleErrors.push(message.text());
    }
  });
  secondPage.on("console", (message) => {
    if (message.type() === "error") {
      secondSenderConsoleErrors.push(message.text());
    }
  });

  try {
    await Promise.all([openClipboardApp(firstPage), openClipboardApp(secondPage)]);

    const firstRoomInput = firstPage.getByTestId("sender-room-id-input");
    await expect
      .poll(
        async () => {
          const value = await firstRoomInput.inputValue();
          return value.trim();
        },
        { timeout: E2E_TIMEOUT.long }
      )
      .not.toBe("");

    const firstRoomId = (await firstRoomInput.inputValue()).trim();
    await joinSender(firstPage, firstRoomId);
    await waitForText(senderStatus(firstPage), "You're the only one here", E2E_TIMEOUT.long);

    await secondPage.getByTestId("sender-room-id-input").fill(firstRoomId);
    await secondPage.getByTestId("sender-join-room-button").click();

    const secondPanel = secondPage.getByTestId("send-panel");
    await waitForText(secondPanel, DUPLICATE_TEXT, E2E_TIMEOUT.long);
    await waitForText(senderStatus(secondPage), "Room is empty", E2E_TIMEOUT.medium);
    await waitForText(senderStatus(firstPage), "You're the only one here", E2E_TIMEOUT.medium);

    await expect(secondPage.getByTestId("sender-join-room-button")).toBeEnabled();
    await expect(secondPage.getByTestId("sender-leave-room-button")).toBeDisabled();

    expect(firstSenderConsoleErrors).toEqual([]);
    expect(secondSenderConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId: firstRoomId,
      firstSenderConsoleErrors,
      secondSenderConsoleErrors,
    });
  } finally {
    await Promise.allSettled([
      firstPage.close(),
      secondPage.close(),
      firstContext.close(),
      secondContext.close(),
    ]);
  }
});
