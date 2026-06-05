import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp, waitForText } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

test("keeps sender and receiver side messages isolated", async ({
  browser,
}, testInfo) => {
  const senderRoomId = `sender-${Date.now()}`;
  const receiverRoomId = `receiver-${Date.now()}`;
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
    const receiverPanel = page.getByTestId("retrieve-panel");

    await page.getByTestId("sender-room-id-input").fill(senderRoomId);
    await page.getByRole("button", { name: "Save ID" }).click();
    await waitForText(senderPanel, "Saved to cache", E2E_TIMEOUT.short);

    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("roomId", "message-isolation-guard");
      window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
    });

    await page.getByTestId("retrieve-tab-button").click();
    await page.getByTestId("receiver-room-id-input").fill(receiverRoomId);
    await page.getByRole("button", { name: "Use cached ID" }).dblclick();
    await page.getByRole("button", { name: "Save ID" }).click();
    await waitForText(receiverPanel, "Saved to cache", E2E_TIMEOUT.short);

    await page.getByTestId("send-tab-button").click();
    const senderPanelText = ((await senderPanel.textContent()) ?? "").trim();

    await page.getByTestId("retrieve-tab-button").click();
    const receiverPanelText = ((await receiverPanel.textContent()) ?? "").trim();

    expect(senderPanelText).toContain("Saved to cache");
    expect(receiverPanelText).toContain("Saved to cache");
    expect(consoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      senderRoomId,
      receiverRoomId,
      senderPanelText,
      receiverPanelText,
      consoleErrors,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
