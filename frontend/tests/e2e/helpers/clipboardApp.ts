import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_SERVER, E2E_TIMEOUT } from "./e2eConfig";

export async function openClipboardApp(page: Page) {
  let lastError: unknown;

  await page.addInitScript(() => {
    window.localStorage.setItem("Choose-location-popup-shown", "true");
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(E2E_SERVER.localePath, { waitUntil: "networkidle" });
      await waitForClipboardAppReady(page);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function waitForClipboardAppReady(page: Page) {
  const senderRoomInput = page.getByTestId("sender-room-id-input");
  const runtimeErrorHeading = page.getByRole("heading", {
    name: "Unhandled Runtime Error",
  });

  for (let poll = 0; poll < 40; poll += 1) {
    if (await senderRoomInput.isVisible().catch(() => false)) {
      return;
    }

    if (await runtimeErrorHeading.isVisible().catch(() => false)) {
      const dialogText =
        (await page.locator('body').textContent().catch(() => "")) ?? "";
      throw new Error(`Clipboard app runtime error: ${dialogText.trim()}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error("Clipboard app did not become ready");
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

export function folderRow(page: Page, folderName: string) {
  return fileRow(page, folderName);
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
  const roomIdInput = page.getByTestId("receiver-room-id-input");
  const joinButton = page.getByTestId("receiver-join-room-button");
  const RATE_LIMIT_BACKOFF_MS = 5_500;

  await page.getByTestId("retrieve-tab-button").click();

  while (Date.now() - startedAt < timeout) {
    await roomIdInput.fill(roomId);

    const statusText = (await receiverStatus(page).textContent()) ?? "";
    if (statusText.includes("Connected")) {
      return;
    }

    if (!(await joinButton.isEnabled())) {
      await page.waitForTimeout(250);
      continue;
    }

    await joinButton.click();

    let rateLimitWaitMs = 0;

    for (let poll = 0; poll < 20; poll += 1) {
      const statusText = (await receiverStatus(page).textContent()) ?? "";
      const panelText = (await panel.textContent()) ?? "";

      if (statusText.includes("Connected")) {
        return;
      }

      if (panelText.includes("Rate limit exceeded")) {
        const resetMatch = panelText.match(/Try again in (\d+)s/i);
        const resetAfterSeconds = resetMatch ? Number(resetMatch[1]) : 0;
        rateLimitWaitMs = Math.max(
          RATE_LIMIT_BACKOFF_MS,
          (resetAfterSeconds + 1) * 1_000
        );
        break;
      }

      await page.waitForTimeout(250);
    }

    await page.waitForTimeout(rateLimitWaitMs || 3_000);
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

export async function syncFolderFromSender(
  page: Page,
  folderPath: string,
  folderName: string
) {
  await page.locator("#folder-upload").setInputFiles(folderPath);
  await waitForText(page.getByTestId("send-panel"), folderName, E2E_TIMEOUT.long);
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

export async function requestFolderFromReceiver(page: Page, folderName: string) {
  const row = folderRow(page, folderName);
  await expect(row).toBeVisible({ timeout: E2E_TIMEOUT.long });
  await row.getByTestId("receiver-file-transfer-button").click();
}
