import type { BrowserContext, Page } from "@playwright/test";
import { CACHED_ROOM_ID_STORAGE_KEY } from "../../../lib/roomIdCache";

/**
 * Seed the cached room ID before any page script runs.
 *
 * The storage key carries a version suffix. Reading it from the module instead
 * of hardcoding the literal here means a future key bump cannot make a dozen
 * specs fail with a misleading "button state is wrong" symptom.
 */
export async function seedCachedRoomId(
  context: BrowserContext,
  roomId: string
): Promise<void> {
  await context.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: CACHED_ROOM_ID_STORAGE_KEY, value: roomId }
  );
}

export async function readCachedRoomId(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => window.localStorage.getItem(key),
    CACHED_ROOM_ID_STORAGE_KEY
  );
}
