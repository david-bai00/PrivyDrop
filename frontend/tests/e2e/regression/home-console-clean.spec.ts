import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp } from "../helpers/clipboardApp";

test("renders the idle homepage without console errors", async ({ browser }, testInfo) => {
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
    await Promise.all([senderPage.waitForTimeout(2_000), receiverPage.waitForTimeout(2_000)]);

    const senderBodyText = ((await senderPage.locator("body").textContent()) ?? "").trim();
    const receiverBodyText = ((await receiverPage.locator("body").textContent()) ?? "").trim();

    expect(senderBodyText).toContain("Share Content");
    expect(receiverBodyText).toContain("Share Content");
    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      senderConsoleErrors,
      receiverConsoleErrors,
      senderBodyIncludesShareContent: senderBodyText.includes("Share Content"),
      receiverBodyIncludesShareContent: receiverBodyText.includes("Share Content"),
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
