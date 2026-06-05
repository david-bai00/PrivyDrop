import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinSender,
  openClipboardApp,
  receiverStatus,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_SERVER, E2E_SERVER_URLS, E2E_TIMEOUT } from "../helpers/e2eConfig";

test("auto-joins the receiver from a roomId URL parameter", async ({
  browser,
}, testInfo) => {
  const roomId = `e2e-url-roomid-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();

  await receiverPage.addInitScript(() => {
    window.localStorage.setItem("Choose-location-popup-shown", "true");
  });

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
    await openClipboardApp(senderPage);
    await joinSender(senderPage, roomId);
    await waitForText(senderStatus(senderPage), "You're the only one here", E2E_TIMEOUT.long);

    const receiverUrl = `${E2E_SERVER_URLS.frontendUrl}${E2E_SERVER.localePath}?roomId=${encodeURIComponent(roomId)}`;
    await receiverPage.goto(receiverUrl, { waitUntil: "networkidle" });

    await waitForText(receiverStatus(receiverPage), "Connected", E2E_TIMEOUT.long);
    await waitForText(senderStatus(senderPage), "2 People in the room", E2E_TIMEOUT.long);

    await expect(receiverPage.getByTestId("retrieve-tab-button")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(receiverPage.getByTestId("receiver-room-id-input")).toHaveValue(roomId);
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      receiverUrl,
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
