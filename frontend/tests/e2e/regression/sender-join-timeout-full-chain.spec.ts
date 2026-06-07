import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp } from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

const JOIN_IN_PROGRESS =
  "Joining the room… this may take 5–30 seconds on slow networks";
const NEGOTIATING = "In the room—establishing a direct P2P connection…";
const JOIN_SLOW = "Feels slow—check your network/VPN or try again shortly";
const JOIN_TIMEOUT =
  "Join timed out (network may be restricted). Please try again";

function normalizeText(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstTraceAt(trace: Array<{ atMs: number; text: string }>, needle: string) {
  const hit = trace.find((entry) => entry.text.includes(needle));
  return hit ? hit.atMs : null;
}

function isExpectedOfflineNoise(text: string) {
  return (
    text.includes("ERR_INTERNET_DISCONNECTED") ||
    text.includes("WebSocket connection to") ||
    (text.includes("Error in apiCall for URL:") && text.includes("/api/logs_debug"))
  );
}

test("shows the full sender timeout chain from startup to slow hint to timeout while offline", async ({
  browser,
}, testInfo) => {
  const senderConsoleErrors: string[] = [];
  const trace: Array<{ atMs: number; text: string; statusText: string }> = [];

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") {
      senderConsoleErrors.push(message.text());
    }
  });

  try {
    await openClipboardApp(page);

    const senderPanel = page.getByTestId("send-panel");
    const senderStatus = page.getByTestId("sender-room-status");
    const senderRoomInput = page.getByTestId("sender-room-id-input");
    const senderJoinButton = page.getByTestId("sender-join-room-button");
    const senderLeaveButton = page.getByTestId("sender-leave-room-button");
    const initialRoomId = (await senderRoomInput.inputValue()).trim();

    await context.setOffline(true);
    const clickStartedAt = Date.now();
    await senderJoinButton.click();

    await expect
      .poll(
        async () => {
          const [panelText, statusText] = await Promise.all([
            senderPanel.textContent(),
            senderStatus.textContent(),
          ]);
          const normalizedPanelText = normalizeText(panelText);
          const normalizedStatusText = normalizeText(statusText);
          trace.push({
            atMs: Date.now() - clickStartedAt,
            text: normalizedPanelText,
            statusText: normalizedStatusText,
          });
          return (
            normalizedPanelText.includes(JOIN_IN_PROGRESS) ||
            normalizedPanelText.includes(NEGOTIATING)
          );
        },
        { timeout: 5_000 }
      )
      .toBe(true);

    await expect
      .poll(
        async () => {
          const [panelText, statusText] = await Promise.all([
            senderPanel.textContent(),
            senderStatus.textContent(),
          ]);
          const normalizedPanelText = normalizeText(panelText);
          const normalizedStatusText = normalizeText(statusText);
          trace.push({
            atMs: Date.now() - clickStartedAt,
            text: normalizedPanelText,
            statusText: normalizedStatusText,
          });
          return normalizedPanelText.includes(JOIN_TIMEOUT);
        },
        { timeout: 23_000 }
      )
      .toBe(true);

    await page.waitForTimeout(200);

    const finalPanelText = normalizeText(await senderPanel.textContent());
    const finalStatusText = normalizeText(await senderStatus.textContent());
    const firstInProgressAt = firstTraceAt(trace, JOIN_IN_PROGRESS);
    const firstNegotiatingAt = firstTraceAt(trace, NEGOTIATING);
    const firstSlowAt = firstTraceAt(trace, JOIN_SLOW);
    const firstTimeoutAt = firstTraceAt(trace, JOIN_TIMEOUT);
    const firstJoinStartupAt =
      firstInProgressAt === null
        ? firstNegotiatingAt
        : firstNegotiatingAt === null
          ? firstInProgressAt
          : Math.min(firstInProgressAt, firstNegotiatingAt);

    const filteredSenderErrors = senderConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );

    expect(firstJoinStartupAt).not.toBeNull();
    expect(firstSlowAt).not.toBeNull();
    expect(firstTimeoutAt).not.toBeNull();
    expect(firstJoinStartupAt!).toBeLessThan(firstSlowAt!);
    expect(firstSlowAt!).toBeLessThan(firstTimeoutAt!);
    expect(trace.some((entry) => entry.text.includes("Successfully joined the room!"))).toBe(
      false
    );
    expect(
      trace.some((entry) =>
        entry.text.includes("This room ID is already in use. Please choose another ID.")
      )
    ).toBe(false);
    expect(finalStatusText).toBe("Room is empty");
    await expect(senderJoinButton).toBeEnabled();
    await expect(senderLeaveButton).toBeDisabled();
    expect(filteredSenderErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      initialRoomId,
      firstInProgressAt,
      firstNegotiatingAt,
      firstSlowAt,
      firstTimeoutAt,
      finalPanelText,
      finalStatusText,
      senderConsoleErrors,
      filteredSenderErrors,
      trace,
    });
  } finally {
    await Promise.allSettled([page.close(), context.close()]);
  }
});
