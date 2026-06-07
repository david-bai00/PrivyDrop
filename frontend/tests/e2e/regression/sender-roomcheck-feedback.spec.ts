import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp, senderStatus, waitForText } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const ROOM_AVAILABLE_TEXT = "Room is available";
const ROOM_NOT_AVAILABLE_TEXT = "Room is not available, please try another";

function randomShortRoomId() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

test("shows roomcheck feedback for both available and occupied sender room ids", async ({
  browser,
}, testInfo) => {
  const ownerConsoleErrors: string[] = [];
  const checkerConsoleErrors: string[] = [];

  const ownerContext = await browser.newContext();
  const checkerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const checkerPage = await checkerContext.newPage();

  ownerPage.on("console", (message) => {
    if (message.type() === "error") {
      ownerConsoleErrors.push(message.text());
    }
  });
  checkerPage.on("console", (message) => {
    if (message.type() === "error") {
      checkerConsoleErrors.push(message.text());
    }
  });

  try {
    await Promise.all([openClipboardApp(ownerPage), openClipboardApp(checkerPage)]);

    const ownerRoomInput = ownerPage.getByTestId("sender-room-id-input");
    await expect
      .poll(async () => (await ownerRoomInput.inputValue()).trim(), {
        timeout: E2E_TIMEOUT.long,
      })
      .not.toBe("");
    const ownerRoomId = (await ownerRoomInput.inputValue()).trim();

    await ownerPage.getByTestId("sender-join-room-button").click();
    await waitForText(senderStatus(ownerPage), "You're the only one here", E2E_TIMEOUT.long);

    const checkerRoomInput = checkerPage.getByTestId("sender-room-id-input");
    const checkerPanel = checkerPage.getByTestId("send-panel");
    const checkerJoinButton = checkerPage.getByTestId("sender-join-room-button");
    const checkerLeaveButton = checkerPage.getByTestId("sender-leave-room-button");

    let availableRoomId = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = randomShortRoomId();
      await checkerRoomInput.fill(candidate);
      await expect(checkerPanel).toContainText(ROOM_AVAILABLE_TEXT, {
        timeout: E2E_TIMEOUT.medium,
      });
      if ((await checkerRoomInput.inputValue()).trim() === candidate) {
        availableRoomId = candidate;
        break;
      }
    }

    expect(availableRoomId).not.toBe("");
    await expect(senderStatus(checkerPage)).toContainText("Room is empty");
    await expect(checkerJoinButton).toBeEnabled();

    await checkerRoomInput.fill(ownerRoomId);
    await expect(checkerPanel).toContainText(ROOM_NOT_AVAILABLE_TEXT, {
      timeout: E2E_TIMEOUT.medium,
    });
    await expect(senderStatus(checkerPage)).toContainText("Room is empty");
    await expect(checkerJoinButton).toBeEnabled();
    await expect(checkerLeaveButton).toBeDisabled();
    expect(ownerConsoleErrors).toEqual([]);
    expect(checkerConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      availableRoomId,
      occupiedRoomId: ownerRoomId,
      ownerConsoleErrors,
      checkerConsoleErrors,
    });
  } finally {
    await Promise.allSettled([
      ownerPage.close(),
      checkerPage.close(),
      ownerContext.close(),
      checkerContext.close(),
    ]);
  }
});
