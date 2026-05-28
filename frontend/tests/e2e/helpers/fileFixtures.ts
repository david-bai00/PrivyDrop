import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { TestInfo } from "@playwright/test";

export interface TextFixture {
  filePath: string;
  fileName: string;
  buffer: Buffer;
  sha256: string;
}

export interface FolderFixtureEntry {
  relativePath: string;
  absolutePath: string;
  content?: string;
  hash?: string;
}

export interface GeneratedFolderFixture {
  folderRoot: string;
  folderName: string;
  entries: FolderFixtureEntry[];
}

export function createAsciiTextFixture(
  testInfo: TestInfo,
  fileName: string,
  sizeBytes: number,
  lineSeed: string
): TextFixture {
  const fixturePath = testInfo.outputPath(fileName);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  const line = `${lineSeed} 0123456789 abcdefghijklmnopqrstuvwxyz\n`;
  const block = Buffer.from(
    line.repeat(Math.ceil((1024 * 1024) / line.length)),
    "utf8"
  );
  const fileHandle = fs.openSync(fixturePath, "w");
  let written = 0;

  try {
    while (written < sizeBytes) {
      const remaining = sizeBytes - written;
      const chunkSize = Math.min(block.length, remaining);
      fs.writeSync(fileHandle, block, 0, chunkSize);
      written += chunkSize;
    }
  } finally {
    fs.closeSync(fileHandle);
  }

  const buffer = fs.readFileSync(fixturePath);

  return {
    filePath: fixturePath,
    fileName,
    buffer,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export function listFolderFixtureEntries(rootDir: string): FolderFixtureEntry[] {
  const entries: FolderFixtureEntry[] = [];

  function walk(currentDir: string) {
    for (const name of fs.readdirSync(currentDir)) {
      const absolutePath = path.join(currentDir, name);
      const stat = fs.statSync(absolutePath);

      if (stat.isDirectory()) {
        walk(absolutePath);
      } else {
        entries.push({
          absolutePath,
          relativePath: path.relative(path.dirname(rootDir), absolutePath),
          content: fs.readFileSync(absolutePath, "utf8"),
        });
      }
    }
  }

  walk(rootDir);
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function createGeneratedFolderFixture(
  testInfo: TestInfo,
  folderName: string,
  largeFileSizeBytes: number,
  lineSeed: string
): GeneratedFolderFixture {
  const folderRoot = testInfo.outputPath(folderName);
  const nestedDir = path.join(folderRoot, "sub");
  const deeperDir = path.join(nestedDir, "deeper");

  fs.mkdirSync(deeperDir, { recursive: true });

  const rootNotePath = path.join(folderRoot, "root-note.txt");
  const nestedNotePath = path.join(nestedDir, "nested-note.txt");
  const leafPath = path.join(deeperDir, "leaf.txt");

  const rootFixture = createAsciiTextFixture(
    testInfo,
    path.join(folderName, "root-note.txt"),
    largeFileSizeBytes,
    lineSeed
  );

  fs.writeFileSync(
    nestedNotePath,
    "Nested note for folder refresh-resume regression.\n",
    "utf8"
  );
  fs.writeFileSync(
    leafPath,
    "Leaf note for folder refresh-resume regression.\n",
    "utf8"
  );

  return {
    folderRoot,
    folderName,
    entries: [
      {
        relativePath: `${folderName}/root-note.txt`,
        absolutePath: rootFixture.filePath,
        hash: crypto.createHash("sha256").update(rootFixture.buffer).digest("hex"),
      },
      {
        relativePath: `${folderName}/sub/nested-note.txt`,
        absolutePath: nestedNotePath,
        content: fs.readFileSync(nestedNotePath, "utf8"),
      },
      {
        relativePath: `${folderName}/sub/deeper/leaf.txt`,
        absolutePath: leafPath,
        content: fs.readFileSync(leafPath, "utf8"),
      },
    ],
  };
}
