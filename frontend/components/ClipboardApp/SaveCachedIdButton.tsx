import React, { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Tooltip from "@/components/Tooltip";
import { setCachedId } from "@/lib/roomIdCache";
import {
  decideSaveCachedIdState,
} from "@/lib/app/cachedIdPresentation";
import type { SideMessageDispatcher } from "@/hooks/useClipboardAppMessages";

type Props = {
  /** Current room ID input value; drives whether saving is meaningful. */
  inputValue: string;
  /** Currently saved room ID, used to detect the already-saved no-op case. */
  cachedId?: string | null;
  /** Whether this panel is currently connected to a room. */
  isInRoom?: boolean;
  /** Reports the save result to the panel side message channel. */
  showMessage: SideMessageDispatcher;
  /** Called after the cache is written so the caller can refresh its view. */
  onSaved?: () => void;
  className?: string;
  testId?: string;
};

/**
 * Save the current room ID as the reusable "my room" ID.
 *
 * The button has one constant meaning: write the input value to localStorage
 * and nothing else. Whether that write is worth offering is decided by
 * decideSaveCachedIdState, and the same decision drives both the rendered
 * state and the click guard.
 *
 * When the input already equals the saved room ID the button stays visible but
 * disabled: the action would rewrite the same value, and keeping the
 * affordance in place still tells the user that this is a valid long room ID
 * which is already saved. Hiding it instead would make the button row jump
 * every time the input crosses the cacheable length.
 */
export function SaveCachedIdButton({
  inputValue,
  cachedId,
  isInRoom = false,
  showMessage,
  onSaved,
  className = "w-full sm:w-auto px-4",
  testId,
}: Props) {
  const tCachedId = useTranslations("text.clipboard.cachedId");
  const state = useMemo(
    () => decideSaveCachedIdState({ inputValue, cachedId, isInRoom }),
    [inputValue, cachedId, isInRoom]
  );

  const handleClick = useCallback(() => {
    // Guard on the rendered state rather than re-deriving it, so an enabled
    // button can never perform a write that changes nothing.
    if (!state.visible || state.disabled) return;

    setCachedId(inputValue.trim());
    showMessage(tCachedId("saveSuccess"));
    onSaved?.();
  }, [state, inputValue, showMessage, tCachedId, onSaved]);

  if (!state.visible) {
    return null;
  }

  return (
    <Tooltip content={tCachedId(state.tooltipKey)}>
      {/* The span keeps the tooltip reachable: the button can be disabled, and a
          disabled button does not emit pointer events of its own. */}
      <span className="inline-block">
        <Button
          variant="outline"
          className={className}
          onClick={handleClick}
          disabled={state.disabled}
          data-testid={testId}
        >
          {tCachedId("save")}
        </Button>
      </span>
    </Tooltip>
  );
}
