import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import {
  joinSender,
  openClipboardApp,
  receiverStatus,
  senderStatus,
  waitForText,
} from "../helpers/clipboardApp";
import { E2E_TIMEOUT } from "../helpers/e2eConfig";
import { createAsciiTextFixture } from "../helpers/fileFixtures";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

test("rejoins immediately and can still download a published file after leaving", async ({
  browser,
}, testInfo) => {
  const roomId = `recv-immediate-rejoin-download-${Date.now()}`;
  const fixture = createAsciiTextFixture(
    testInfo,
    `p7fd-${String(Date.now()).slice(-6)}.txt`,
    16 * 1024,
    "Phase 7 rapid rejoin file download fixture"
  );
  const senderConsoleErrors: string[] = [];
  const receiverConsoleErrors: string[] = [];
  const rejoinTrace: Array<{
    atMs: number;
    senderStatus: string;
    senderPanel: string;
    receiverStatus: string;
    receiverPanel: string;
  }> = [];

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  await receiverContext.addInitScript(() => {
    const testWindow = window as any;
    testWindow.__downloadRecords = [];
    testWindow.__downloadBlobMap = new Map();

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectURL(blob);
      testWindow.__downloadBlobMap.set(url, blob);
      return url;
    };

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patchedClick() {
      if (this.download) {
        testWindow.__downloadRecords.push({
          name: this.download,
          href: this.href,
        });
      }
      return originalClick.call(this);
    };
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

    const senderRoomStatus = senderStatus(senderPage);
    const senderPanel = senderPage.getByTestId("send-panel");
    const receiverRoomStatus = receiverStatus(receiverPage);
    const receiverPanel = receiverPage.getByTestId("retrieve-panel");
    const receiverJoinButton = receiverPage.getByTestId("receiver-join-room-button");
    const receiverLeaveButton = receiverPage.getByTestId("receiver-leave-room-button");
    const receiverInput = receiverPage.getByTestId("receiver-room-id-input");

    await joinSender(senderPage, roomId);
    await waitForText(senderRoomStatus, "You're the only one here", E2E_TIMEOUT.long);

    await receiverPage.getByTestId("retrieve-tab-button").click();
    await receiverInput.fill(roomId);
    await receiverJoinButton.click();
    await waitForText(senderRoomStatus, "2 People in the room", E2E_TIMEOUT.long);
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await senderPage.locator("#file-upload").setInputFiles(fixture.filePath);
    await waitForText(senderPanel, fixture.fileName, E2E_TIMEOUT.long);
    await senderPage.getByTestId("sender-sync-button").click();
    await waitForText(receiverPanel, fixture.fileName, E2E_TIMEOUT.long);

    await receiverLeaveButton.click();
    await expect(receiverJoinButton).toBeEnabled({ timeout: E2E_TIMEOUT.short });
    await expect
      .poll(async () => ((await receiverPanel.textContent()) ?? "").includes(fixture.fileName), {
        timeout: E2E_TIMEOUT.medium,
      })
      .toBe(false);
    await waitForText(
      receiverRoomStatus,
      "You can accept an invitation to join the room",
      E2E_TIMEOUT.long
    );

    const rejoinStartedAt = Date.now();
    await receiverJoinButton.click();
    await waitForText(receiverRoomStatus, "Connected", E2E_TIMEOUT.long);

    await expect
      .poll(
        async () => {
          const snapshot = {
            atMs: Date.now() - rejoinStartedAt,
            senderStatus: normalizeText(await senderRoomStatus.textContent()),
            senderPanel: normalizeText(await senderPanel.textContent()),
            receiverStatus: normalizeText(await receiverRoomStatus.textContent()),
            receiverPanel: normalizeText(await receiverPanel.textContent()),
          };
          rejoinTrace.push(snapshot);
          return snapshot.receiverPanel.includes(fixture.fileName);
        },
        { timeout: E2E_TIMEOUT.long }
      )
      .toBe(true);

    const receiverFileRow = receiverPage
      .getByTestId("clipboard-file-row")
      .filter({ hasText: fixture.fileName })
      .first();
    await expect(receiverFileRow).toBeVisible({ timeout: E2E_TIMEOUT.long });
    await receiverFileRow.getByTestId("receiver-file-transfer-button").click();

    await expect
      .poll(
        async () =>
          await receiverPage.evaluate(async () => {
            const testWindow = window as any;
            const records = testWindow.__downloadRecords ?? [];
            const latestRecord = records[records.length - 1];
            if (!latestRecord) {
              return null;
            }

            const blob = testWindow.__downloadBlobMap.get(latestRecord.href);
            if (!blob) {
              return { name: latestRecord.name, bytes: null };
            }

            return {
              name: latestRecord.name,
              bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
            };
          }),
        { timeout: E2E_TIMEOUT.long }
      )
      .toEqual({
        name: fixture.fileName,
        bytes: Array.from(fixture.buffer),
      });

    expect(senderConsoleErrors).toEqual([]);
    expect(receiverConsoleErrors).toEqual([]);

    await writeJsonArtifact(testInfo, "result.json", {
      roomId,
      fileName: fixture.fileName,
      senderConsoleErrors,
      receiverConsoleErrors,
      rejoinTrace,
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
