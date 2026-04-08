import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(__dirname, "..", "..");
const ALLOWED_CALLERS = new Set([
  path.join(FRONTEND_ROOT, "lib", "logger.ts"),
]);
const ALLOWED_DEFINITIONS = new Set([
  path.join(FRONTEND_ROOT, "app", "config", "api.ts"),
]);

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

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

describe("backend logging boundaries", () => {
  it("only allows direct postLogToBackend calls inside logger.ts", () => {
    const apiName = ["postLogTo", "Backend"].join("");
    const callPattern = new RegExp(`${apiName}\\s*\\(`);
    const offenders = listSourceFiles(FRONTEND_ROOT).filter((filePath) => {
      if (ALLOWED_CALLERS.has(filePath) || ALLOWED_DEFINITIONS.has(filePath)) {
        return false;
      }

      const source = fs.readFileSync(filePath, "utf8");
      return callPattern.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("only allows importing postLogToBackend inside logger.ts", () => {
    const apiName = ["postLogTo", "Backend"].join("");
    const importPattern = new RegExp(
      `import\\s*\\{[^}]*${apiName}[^}]*\\}\\s*from\\s*[\"'][^\"']+[\"']`
    );
    const offenders = listSourceFiles(FRONTEND_ROOT).filter((filePath) => {
      if (ALLOWED_CALLERS.has(filePath)) {
        return false;
      }

      const source = fs.readFileSync(filePath, "utf8");
      return importPattern.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
