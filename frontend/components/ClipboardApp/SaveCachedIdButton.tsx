import React, { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Tooltip from "@/components/Tooltip";
import {
  MIN_CACHEABLE_ROOM_ID_LENGTH,
  setCachedId,
} from "@/lib/roomIdCache";
import type { SideMessageDispatcher } from "@/hooks/useClipboardAppMessages";

type Props = {
  /** Current room ID input value; drives whether saving is meaningful. */
  inputValue: string;
  /** Currently cached room ID, used to detect the already-saved no-op case. */
  cachedId?: string | null;
  /** Reports the save result to the panel side message channel. */
  showMessage: SideMessageDispatcher;
  /** Called after the cache is written so the caller can refresh its view. */
  onSaved?: () => void;
  className?: string;
  disabled?: boolean;
};

/**
 * Save the current room ID as the reusable "my room" ID.
 *
 * Renders only when the input holds a long room ID (>= MIN_CACHEABLE_ROOM_ID_LENGTH).
 * Visibility follows state, but the button's meaning never changes: it always
 * writes the input value to localStorage and nothing else.
 *
 * When the input already equals the cached room ID the button stays visible but
 * disabled: the action would be a no-op, and keeping the affordance in place
 * still tells the user "this is a valid long room ID, and it is already saved".
 */
export function SaveCachedIdButton({
  inputValue,
  cachedId,
  showMessage,
  onSaved,
  className = "w-full sm:w-auto px-4",
  disabled = false,
}: Props) {
  const tCachedId = useTranslations("text.clipboard.cachedId");
  const isAlreadySaved =
    !!cachedId && inputValue.trim() === cachedId.trim();

  const handleClick = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed.length < MIN_CACHEABLE_ROOM_ID_LENGTH) return;
    if (trimmed === cachedId?.trim()) return;

    setCachedId(trimmed);
    showMessage(tCachedId("saveSuccess"));
    onSaved?.();
  }, [inputValue, cachedId, showMessage, tCachedId, onSaved]);

  if (inputValue.trim().length < MIN_CACHEABLE_ROOM_ID_LENGTH) {
    return null;
  }

  return (
    <Tooltip
      content={tCachedId(isAlreadySaved ? "saveTipAlreadySaved" : "saveTip")}
    >
      <span className="inline-block">
        <Button
          variant="outline"
          className={className}
          onClick={handleClick}
          disabled={disabled || isAlreadySaved}
        >
          {tCachedId("save")}
        </Button>
      </span>
    </Tooltip>
  );
}
