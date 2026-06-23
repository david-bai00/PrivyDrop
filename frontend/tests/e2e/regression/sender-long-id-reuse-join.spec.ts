import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinSender,
  openClipboardApp,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

test("allows a second sender to reuse a long room id without surfacing duplicate-room failure", async ({
  browser,
}, testInfo) => {
  const roomId = `e2e-long-room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

    await joinSender(firstPage, roomId);
    await waitForText(senderStatus(firstPage), "You're the only one here", E2E_TIMEOUT.long);

    await joinSender(secondPage, roomId);

    const secondPanel = secondPage.getByTestId("send-panel");
    await waitForText(secondPanel, "Successfully joined the room!", E2E_TIMEOUT.long);
    await expect(secondPage.getByTestId("sender-join-room-button")).toBeDisabled();
    await expect(secondPage.getByTestId("sender-leave-room-button")).toBeEnabled();

    const secondPanelText = ((await secondPanel.textContent()) ?? "").trim();
    const secondStatusText = ((await senderStatus(secondPage).textContent()) ?? "").trim();

    expect(secondPanelText).not.toContain(
      "This room ID is already in use. Please choose another ID."
    );
    expect(secondStatusText).not.toBe("Room is empty");
    expect(firstSenderConsoleErrors).toEqual([]);
    expect(secondSenderConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      secondStatusText,
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
