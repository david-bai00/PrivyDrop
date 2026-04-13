import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(process.cwd());

function readFrontendFile(relativePath: string): string {
  return fs.readFileSync(path.join(FRONTEND_ROOT, relativePath), "utf8");
}

describe("clipboard message layer boundaries", () => {
  it("wraps ClipboardApp in the local message provider", () => {
    const source = readFrontendFile("components/ClipboardApp.tsx");

    expect(source).toContain("ClipboardAppMessagesProvider");
  });

  it("keeps message rendering out of parent prop drilling", () => {
    const source = readFrontendFile("components/ClipboardApp.tsx");

    expect(source).not.toContain("shareMessage=");
    expect(source).not.toContain("retrieveMessage=");
    expect(source).not.toContain("showSenderMessage=");
    expect(source).not.toContain("showReceiverMessage=");
  });

  it("lets side-specific hooks and panels read message dispatchers from context", () => {
    const files = [
      "components/ClipboardApp/SendTabPanel.tsx",
      "components/ClipboardApp/RetrieveTabPanel.tsx",
      "hooks/useRoomManager.ts",
      "hooks/useFileTransferHandler.ts",
      "hooks/useConnectionFeedback.ts",
    ];

    for (const relativePath of files) {
      const source = readFrontendFile(relativePath);
      expect(source).toContain("useClipboardAppMessageDispatcher(");
    }
  });
});
