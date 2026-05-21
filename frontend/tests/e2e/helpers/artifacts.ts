import fs from "node:fs/promises";
import type { TestInfo } from "@playwright/test";

export async function writeJsonArtifact(
  testInfo: TestInfo,
  fileName: string,
  payload: unknown
) {
  const filePath = testInfo.outputPath(fileName);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
