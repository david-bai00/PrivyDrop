import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_TIMEOUT } from "./e2eConfig";

export async function waitForTransferStart(
  rowLocator: Locator,
  timeout = E2E_TIMEOUT.long
) {
  await expect
    .poll(
      async () => {
        const text = (await rowLocator.textContent()) ?? "";
        const match = text.match(/(\d+)%/);
        return match ? Number(match[1]) : 0;
      },
      { timeout }
    )
    .toBeGreaterThan(0);
}

export async function waitForReconnectInterruption(
  senderStatus: Locator,
  receiverStatus: Locator,
  receiverPanel: Locator,
  timeout = E2E_TIMEOUT.long
) {
  await expect
    .poll(
      async () => {
        const [senderText, receiverText, receiverPanelText] = await Promise.all([
          senderStatus.textContent(),
          receiverStatus.textContent(),
          receiverPanel.textContent(),
        ]);

        return (
          (receiverPanelText ?? "").includes("Reconnecting") ||
          (receiverText ?? "").includes("Sender disconnected") ||
          (senderText ?? "").includes("You're the only one here")
        );
      },
      { timeout }
    )
    .toBe(true);
}

export async function waitForReconnectRecovered(
  expectedSenderText: string,
  senderStatus: Locator,
  receiverStatus: Locator,
  receiverPanel: Locator,
  timeout = E2E_TIMEOUT.long
) {
  await expect
    .poll(
      async () => {
        const [senderText, receiverText, receiverPanelText] = await Promise.all([
          senderStatus.textContent(),
          receiverStatus.textContent(),
          receiverPanel.textContent(),
        ]);

        return (
          (senderText ?? "").includes(expectedSenderText) &&
          (receiverText ?? "").includes("Connected") &&
          !(receiverPanelText ?? "").includes("Reconnecting")
        );
      },
      { timeout }
    )
    .toBe(true);
}

export async function waitForResumeRequestAfter(
  page: Page,
  minRequestCount: number,
  timeout = E2E_TIMEOUT.long
) {
  await expect
    .poll(
      async () => {
        const requests = (await page.evaluate(() => {
          return (window as any).__capturedFileRequests as Array<{
            type: string;
            offset?: number;
          }>;
        })) ?? [];

        return requests
          .slice(minRequestCount)
          .find(
            (request) =>
              request?.type === "fileRequest" &&
              typeof request.offset === "number" &&
              request.offset > 0
          )?.offset;
      },
      { timeout }
    )
    .toBeGreaterThan(0);
}
