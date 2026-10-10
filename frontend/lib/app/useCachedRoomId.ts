"use client";

import { useCallback, useEffect, useState } from "react";
import { getCachedId } from "@/lib/roomIdCache";

/**
 * Read the cached room ID from localStorage and expose a refresh callback.
 *
 * The cached ID changes only when the user explicitly saves or the browser
 * storage is mutated elsewhere, so the value is read on mount and refreshed on
 * demand instead of subscribing to storage events.
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
  }, [refreshCachedId]);

  return { cachedId, refreshCachedId };
}
