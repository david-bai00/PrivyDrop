import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(process.cwd());
const LOGGER_SCOPE_PATTERN = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/;
const CONSOLE_USAGE_PATTERN =
  /console\.(log|warn|error|info|debug|trace)|console\[level\]|catch\(console\.error\)/;
const RUNTIME_ONLY_FILES = [
  "lib/fileSender.ts",
  "lib/fileReceiver.ts",
  "lib/app/WebRTCStoreCoordinator.ts",
  "lib/wakeLockManager.tsx",
] as const;
const MIXED_SCOPE_ALLOWED_CONSOLE_LINES = new Map<string, string[]>([
  [
    "components/ClipboardApp/RetrieveTabPanel.tsx",
    ['console.error("Failed to set up folder receive:", err);'],
  ],
  [
    "hooks/useFileTransferHandler.ts",
    ['console.error("Error creating zip file:", error);'],
  ],
  [
    "hooks/useRoomManager.ts",
    [
      'console.error("[RoomManager] Failed to join room:", error);',
      'console.error("[RoomManager] Failed to generate share link:", error);',
      'console.error("[RoomManager] Receiver failed to leave room:", error);',
      'console.error("[RoomManager] Failed to reset sender state:", error);',
      'console.error("[RoomManager] Sender failed to leave room:", error);',
      'console.error("[RoomManager] Failed to validate room:", error);',
      'console.error("[RoomManager] Failed to fetch initial room:", err);',
    ],
  ],
]);

function listSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".next" || entry.name === "node_modules") {
        return [];
      }

      return listSourceFiles(fullPath);
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [fullPath];
  });
}

function readRelativeSource(relativePath: string): string {
  return fs.readFileSync(path.join(FRONTEND_ROOT, relativePath), "utf8");
}

function findConsoleLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        /console\.(log|warn|error|info|debug|trace)/.test(line) ||
        /console\[level\]/.test(line) ||
        /catch\(console\.error\)/.test(line)
    );
}

describe("logger source boundaries", () => {
  it("uses object-based logger calls instead of the removed string signature", () => {
    const sourceFiles = ["components", "hooks", "lib"].flatMap((segment) =>
      listSourceFiles(path.join(FRONTEND_ROOT, segment))
    );
    const offenders = sourceFiles.filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return /logger\.(debug|info|warn|error)\(\s*"/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("keeps createLogger scopes within the agreed naming convention", () => {
    const violations: string[] = [];
    const sourceFiles = ["components", "hooks", "lib"].flatMap((segment) =>
      listSourceFiles(path.join(FRONTEND_ROOT, segment))
    );

    for (const filePath of sourceFiles) {
      const source = fs.readFileSync(filePath, "utf8");
      const matches = Array.from(
        source.matchAll(/createLogger\(\{\s*scope:\s*"([^"]+)"/g)
      );

      for (const match of matches) {
        const scope = match[1];
        if (!LOGGER_SCOPE_PATTERN.test(scope)) {
          violations.push(`${path.relative(FRONTEND_ROOT, filePath)}:${scope}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("rejects direct console usage in runtime-only logging debt files", () => {
    const offenders = RUNTIME_ONLY_FILES.filter((relativePath) =>
      CONSOLE_USAGE_PATTERN.test(readRelativeSource(relativePath))
    );

    expect(offenders).toEqual([]);
  });

  it("only allows the approved fallback console lines in mixed-scope files", () => {
    const offenders: Array<{ file: string; lines: string[] }> = [];

    for (const [relativePath, allowedLines] of MIXED_SCOPE_ALLOWED_CONSOLE_LINES) {
      const consoleLines = findConsoleLines(readRelativeSource(relativePath));
      const disallowedLines = consoleLines.filter(
        (line) => !allowedLines.includes(line)
      );
      const missingAllowedLines = allowedLines.filter(
        (line) => !consoleLines.includes(line)
      );

      if (disallowedLines.length > 0 || missingAllowedLines.length > 0) {
        offenders.push({
          file: relativePath,
          lines: [...disallowedLines, ...missingAllowedLines.map((line) => `MISSING: ${line}`)],
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
