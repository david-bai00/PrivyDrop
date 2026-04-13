import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(process.cwd());
const LOGGER_SCOPE_PATTERN = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/;

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
});
