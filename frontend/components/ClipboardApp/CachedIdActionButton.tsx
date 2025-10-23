import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Tooltip from "@/components/Tooltip";
import type { Messages } from "@/types/messages";
import { getCachedId, setCachedId } from "@/lib/roomIdCache";

/**
 * CachedIdActionButton
 *
 * A reusable action button that unifies the "Use cached ID" and "Save ID" behaviors
 * across sender and receiver panels.
 *
 * UX
 * - If a cached Room ID exists:
 *   - Single click (no second click within dblClickWindowMs, default 400ms):
 *     writes the cached ID into the target input without availability checks
 *     (matching the current Random ID UX).
 *   - Double click (two clicks within dblClickWindowMs): switches to a temporary
 *     "Save ID" mode for saveModeDurationMs (default 3000ms) without filling.
 * - If no cached Room ID exists: the button shows "Save ID" by default; when the
 *   current input length >= 8, clicking saves it to localStorage and reports success
 *   via putMessageInMs, then the button returns to "Use cached ID".
 * - In "Save ID" mode: clicking saves the current input (>= 8) and exits the mode;
 *   if the user does nothing, the mode auto-exits after saveModeDurationMs.
 *
 * Props
 * - messages: i18n dictionary used for labels/tooltips.
 * - getInputValue / setInputValue: provide read/write access to the room ID input.
 * - putMessageInMs: message dispatcher; isShareEnd tells which side (sender/receiver)
 *   should display the toast.
 * - Optional styling/timing overrides: className, variant, size, dblClickWindowMs,
 *   saveModeDurationMs — with sensible defaults for drop‑in usage.
 *
 * Implementation
 * - Local state tracks if a cached ID exists and whether we are in temporary
 *   "save override" mode.
 * - Single/double click detection uses a short timer + click counter refs;
 *   timers are cleaned up on unmount to avoid leaks.
 * - localStorage reads/writes are abstracted via getCachedId/setCachedId.
 * - No network calls, and no availability checks during "Use cached ID" to keep
 *   the interaction snappy and consistent with Random ID behavior.
 */

type Props = {
  messages: Messages;
  getInputValue: () => string;
  setInputValue: (val: string) => void;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
  isShareEnd: boolean; // true for sender, false for receiver
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  dblClickWindowMs?: number; // default 400ms
  saveModeDurationMs?: number; // default 3000ms
};

export default function CachedIdActionButton({
  messages,
  getInputValue,
  setInputValue,
  putMessageInMs,
  isShareEnd,
  className = "w-full sm:w-auto px-4",
  variant = "outline",
  size = "default",
  dblClickWindowMs = 400,
  saveModeDurationMs = 3000,
}: Props) {
  const [hasCachedId, setHasCachedId] = useState<boolean>(false);
  const [showSaveOverride, setShowSaveOverride] = useState<boolean>(false);
  const clickCountRef = useRef(0);
  const singleTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setHasCachedId(!!getCachedId());
  }, []);

  useEffect(() => {
    return () => {
      if (singleTimerRef.current) {
        clearTimeout(singleTimerRef.current);
        singleTimerRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const isSaveMode = showSaveOverride || !hasCachedId;
  const inputVal = getInputValue() || "";
  const isSaveEnabled = inputVal.trim().length >= 8;

  const handleClick = useCallback(() => {
    if (isSaveMode) {
      const trimmed = (getInputValue() || "").trim();
      if (trimmed.length >= 8) {
        setCachedId(trimmed);
        setHasCachedId(true);
        setShowSaveOverride(false);
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        putMessageInMs(messages.text.ClipboardApp.saveId_success, isShareEnd);
      }
      return;
    }

    // Use cached with single/double click detection
    clickCountRef.current += 1;
    if (clickCountRef.current === 1) {
      // Single click timer
      singleTimerRef.current = window.setTimeout(() => {
        if (clickCountRef.current === 1) {
          const cached = getCachedId();
          if (cached) {
            setInputValue(cached);
          }
        }
        clickCountRef.current = 0;
        if (singleTimerRef.current) {
          clearTimeout(singleTimerRef.current);
          singleTimerRef.current = null;
        }
      }, dblClickWindowMs);
    } else if (clickCountRef.current === 2) {
      // Double click => switch to save mode
      if (singleTimerRef.current) {
        clearTimeout(singleTimerRef.current);
        singleTimerRef.current = null;
      }
      clickCountRef.current = 0;
      setShowSaveOverride(true);
      saveTimerRef.current = window.setTimeout(() => {
        setShowSaveOverride(false);
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
      }, saveModeDurationMs);
    }
  }, [
    isSaveMode,
    getInputValue,
    setInputValue,
    putMessageInMs,
    messages.text.ClipboardApp.saveId_success,
    isShareEnd,
    dblClickWindowMs,
    saveModeDurationMs,
  ]);

  return (
    <Tooltip
      content={
        isSaveMode
          ? messages.text.ClipboardApp.html.saveId_tips
          : messages.text.ClipboardApp.html.useCachedId_tips
      }
    >
      <span className="inline-block">
        <Button
          className={className}
          variant={variant}
          size={size}
          onClick={handleClick}
          disabled={isSaveMode ? !isSaveEnabled : !hasCachedId}
        >
          {isSaveMode
            ? messages.text.ClipboardApp.html.saveId_dis
            : messages.text.ClipboardApp.html.useCachedId_dis}
        </Button>
      </span>
    </Tooltip>
  );
}
