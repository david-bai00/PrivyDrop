import fs from "node:fs/promises";
import { REDIS_STATE_PATH } from "./helpers/e2eConfig";

export default async function globalTeardown() {
  try {
    const rawState = await fs.readFile(REDIS_STATE_PATH, "utf8");
    const state = JSON.parse(rawState) as { managedPids?: number[] };

    for (const pid of [...(state.managedPids ?? [])].reverse()) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // Ignore teardown races when the process already exited.
      }
    }
  } finally {
    await fs.rm(REDIS_STATE_PATH, { force: true });
  }
}
