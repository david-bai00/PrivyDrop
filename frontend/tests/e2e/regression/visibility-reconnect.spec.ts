import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinReceiverWithRetry,
  joinSender,
  openClipboardApp,
  receiverStatus,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";

function isExpectedOfflineNoise(text: string) {
  return (
    text.includes("ERR_INTERNET_DISCONNECTED") ||
    text.includes("WebSocket connection to") ||
    (text.includes("Error in apiCall for URL:") && text.includes("/api/logs_debug"))
  );
}

async function setVisibilityState(page: Page, nextState: "hidden" | "visible") {
  await page.evaluate((state) => {
    (window as Window & { __codexVisibilityState?: string }).__codexVisibilityState = state;
    document.dispatchEvent(new Event("visibilitychange"));
  }, nextState);
}

async function captureStatusSnapshot(
  senderRoomStatus: Locator,
  receiverRoomStatus: Locator,
  receiverPanel: Locator
) {
  const [senderText, receiverText, receiverPanelText] = await Promise.all([
    senderRoomStatus.textContent(),
    receiverRoomStatus.textContent(),
    receiverPanel.textContent(),
  ]);

  return {
    senderStatus: (senderText ?? "").trim(),
    receiverStatus: (receiverText ?? "").trim(),
    receiverPanel: (receiverPanelText ?? "").trim(),
  };
}

test("recovers when the receiver returns to a visible tab after going offline", async ({
  browser,
}, testInfo) => {
  const roomId = `e2e-visibility-reconnect-${Date.now()}`;
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];
  let visibleWhileOfflineSnapshot:
    | (Awaited<ReturnType<typeof captureStatusSnapshot>> & { afterVisible: true })
    | null = null;
  const hiddenOfflineSnapshots: Array<
    Awaited<ReturnType<typeof captureStatusSnapshot>> & { step: number }
  > = [];
  const recoverySnapshots: Array<
    Awaited<ReturnType<typeof captureStatusSnapshot>> & { step: number }
  > = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();

  await receiverContext.addInitScript(() => {
    (
      window as Window & {
        __codexVisibilityState?: "hidden" | "visible";
      }
    ).__codexVisibilityState = "visible";

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get() {
        return (
          (
            window as Window & {
              __codexVisibilityState?: "hidden" | "visible";
            }
          ).__codexVisibilityState ?? "visible"
        );
      },
    });

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get() {
        return (
          (
            window as Window & {
              __codexVisibilityState?: "hidden" | "visible";
            }
          ).__codexVisibilityState ?? "visible"
        ) !== "visible";
      },
    });
  });

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

    await joinSender(senderPage, roomId);
    await joinReceiverWithRetry(receiverPage, roomId);

    const senderRoomStatus = senderStatus(senderPage);
    const receiverRoomStatus = receiverStatus(receiverPage);
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");

    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await setVisibilityState(receiverPage, "hidden");
    await receiverContext.setOffline(true);

    let observedDisconnected = false;
    for (let step = 1; step <= 10; step += 1) {
      await receiverPage.waitForTimeout(5_000);
      const snapshot = await captureStatusSnapshot(
        senderRoomStatus,
        receiverRoomStatus,
        receiverPanel
      );

      hiddenOfflineSnapshots.push({ step, ...snapshot });

      if (
        snapshot.receiverStatus.includes("Sender disconnected") ||
        snapshot.senderStatus.includes("You're the only one here")
      ) {
        observedDisconnected = true;
        break;
      }
    }

    expect(observedDisconnected).toBe(true);

    await setVisibilityState(receiverPage, "visible");
    await receiverPage.waitForTimeout(1_000);
    visibleWhileOfflineSnapshot = {
      afterVisible: true,
      ...(await captureStatusSnapshot(
        senderRoomStatus,
        receiverRoomStatus,
        receiverPanel
      )),
    };

    expect(visibleWhileOfflineSnapshot.senderStatus).toContain("You're the only one here");
    expect(
      ["Connected", "Sender disconnected"].some((statusText) =>
        visibleWhileOfflineSnapshot.receiverStatus.includes(statusText)
      )
    ).toBe(true);
    expect(visibleWhileOfflineSnapshot.receiverPanel).not.toContain("Connection restored");

    await receiverContext.setOffline(false);

    let observedRecovered = false;
    for (let step = 1; step <= 8; step += 1) {
      await receiverPage.waitForTimeout(5_000);
      const snapshot = await captureStatusSnapshot(
        senderRoomStatus,
        receiverRoomStatus,
        receiverPanel
      );

      recoverySnapshots.push({ step, ...snapshot });

      if (
        snapshot.senderStatus.includes("2 People in the room") &&
        snapshot.receiverStatus.includes("Connected") &&
        !snapshot.receiverPanel.includes("Reconnecting")
      ) {
        observedRecovered = true;
        break;
      }
    }

    const filteredSenderErrors = senderConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );
    const filteredReceiverErrors = receiverConsoleErrors.filter(
      (text) => !isExpectedOfflineNoise(text)
    );

    expect(observedRecovered).toBe(true);
    expect(filteredSenderErrors).toEqual([]);
    expect(filteredReceiverErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      visibleWhileOfflineSnapshot,
      hiddenOfflineSnapshots,
      recoverySnapshots,
      senderConsoleErrors,
      receiverConsoleErrors,
      filteredSenderErrors,
      filteredReceiverErrors,
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
