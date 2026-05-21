import crypto from "node:crypto";
import fs from "node:fs";
import type { TestInfo } from "@playwright/test";

export interface TextFixture {
  filePath: string;
  fileName: string;
  buffer: Buffer;
  sha256: string;
}

export function createAsciiTextFixture(
  testInfo: TestInfo,
  fileName: string,
  sizeBytes: number,
  lineSeed: string
): TextFixture {
  const fixturePath = testInfo.outputPath(fileName);
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
