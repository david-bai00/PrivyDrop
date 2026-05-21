import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_SERVER, E2E_TIMEOUT } from "./e2eConfig";

export async function openClipboardApp(page: Page) {
  await page.goto(E2E_SERVER.localePath, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.localStorage.setItem("Choose-location-popup-shown", "true");
  });
}

export function senderStatus(page: Page) {
  return page.getByTestId("sender-room-status");
}

export function receiverStatus(page: Page) {
  return page.getByTestId("receiver-room-status");
}

export function fileRow(page: Page, fileName: string) {
  return page
    .getByTestId("clipboard-file-row")
    .filter({ hasText: fileName })
    .first();
}

export async function waitForText(locator: Locator, text: string, timeout = E2E_TIMEOUT.medium) {
  await expect
    .poll(async () => (await locator.textContent()) ?? "", { timeout })
    .toContain(text);
}

export async function joinSender(page: Page, roomId: string) {
  await page.getByTestId("sender-room-id-input").fill(roomId);
  await page.getByTestId("sender-join-room-button").click();
}

export async function joinReceiverWithRetry(
  page: Page,
  roomId: string,
  timeout = E2E_TIMEOUT.long
) {
  const startedAt = Date.now();
  const panel = page.getByTestId("retrieve-panel");

  await page.getByTestId("retrieve-tab-button").click();
  await page.getByTestId("receiver-room-id-input").fill(roomId);

  while (Date.now() - startedAt < timeout) {
    await page.getByTestId("receiver-join-room-button").click();

    for (let poll = 0; poll < 20; poll += 1) {
      const statusText = (await receiverStatus(page).textContent()) ?? "";
      const panelText = (await panel.textContent()) ?? "";

      if (statusText.includes("Connected")) {
        return;
      }

      if (panelText.includes("Rate limit exceeded")) {
        break;
      }

      await page.waitForTimeout(250);
    }

    await page.waitForTimeout(3_000);
  }

  throw new Error("Timed out joining receiver after retrying rate limit failures");
}

export async function syncFileFromSender(
  page: Page,
  filePath: string,
  fileName: string
) {
  await page.locator("#file-upload").setInputFiles(filePath);
  await waitForText(page.getByTestId("send-panel"), fileName, E2E_TIMEOUT.long);
  await page.getByTestId("sender-sync-button").click();
}

export async function chooseSaveLocation(page: Page) {
  await page.getByTestId("choose-save-location-button").click();
}

export async function requestFileFromReceiver(page: Page, fileName: string) {
  const row = fileRow(page, fileName);
  await expect(row).toBeVisible({ timeout: E2E_TIMEOUT.long });
  await row.getByTestId("receiver-file-transfer-button").click();
}
