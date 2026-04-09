import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(process.cwd());
const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);
const FORBIDDEN_PATTERNS = [
  "applyReceiverStoreReset",
  "applySenderStoreReset",
  "setRetrievedContent",
  "setRetrievedFiles",
  "setRetrievedFileMetas",
  "setShareRoomId",
  "setInitShareRoomId",
  "setSenderDraftContent",
  "setSenderDraftFiles",
  "addSenderDraftFiles",
  "removeSenderDraftFile",
  "publishSenderDraftPayload",
];

function listSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) {
      return [];
    }

    return [fullPath];
  });
}

describe("domain store writes stay behind the app coordinator boundary", () => {
  it("forbids direct domain-store action usage inside hooks and components", () => {
    const sourceRoots = ["components", "hooks"].map((segment) =>
      path.join(FRONTEND_ROOT, segment)
    );

    const violations: string[] = [];

    for (const sourceRoot of sourceRoots) {
      for (const filePath of listSourceFiles(sourceRoot)) {
        const content = fs.readFileSync(filePath, "utf8");

        for (const pattern of FORBIDDEN_PATTERNS) {
          const destructuredFromStore = new RegExp(
            `\\{[^}]*\\b${pattern}\\b[^}]*\\}\\s*=\\s*useFileTransferStore\\(`
          ).test(content);
          const calledFromStore = new RegExp(
            `useFileTransferStore(?:\\.getState\\(\\))?\\.[^(\\n]*\\b${pattern}\\b`
          ).test(content);

          if (destructuredFromStore || calledFromStore) {
            violations.push(`${path.relative(FRONTEND_ROOT, filePath)}:${pattern}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
