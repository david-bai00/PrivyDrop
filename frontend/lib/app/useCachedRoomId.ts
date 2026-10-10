"use client";

import { useCallback, useEffect, useState } from "react";
import { getCachedId } from "@/lib/roomIdCache";

/**
 * Read the cached room ID from localStorage and expose a refresh callback.
 *
 * The cached ID changes only when the user explicitly saves it, so the value is
 * read on mount and refreshed on demand. The two storage listeners below cover
 * the writes this hook cannot see itself:
 *
 * - "storage" fires in the *other* tabs of the same origin. Without it, a tab
 *   that was open while the user saved a room id in another tab keeps a null
 *   cached ID forever, and the save button stays enabled on an already-saved
 *   room: clicking it writes nothing and still reports success.
 * - "focus" covers returning to a tab whose storage changed while it was in the
 *   background, since some browsers coalesce or skip storage events for tabs
 *   that were not visible.
 */
export function useCachedRoomId(): {
  cachedId: string | null;
  refreshCachedId: () => void;
} {
  const [cachedId, setCachedId] = useState<string | null>(null);

  const refreshCachedId = useCallback(() => {
    setCachedId(getCachedId());
  }, []);

  useEffect(() => {
    refreshCachedId();
    window.addEventListener("storage", refreshCachedId);
    window.addEventListener("focus", refreshCachedId);
    return () => {
      window.removeEventListener("storage", refreshCachedId);
      window.removeEventListener("focus", refreshCachedId);
    };
  }, [refreshCachedId]);

  return { cachedId, refreshCachedId };
}
