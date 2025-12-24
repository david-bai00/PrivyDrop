import { useCallback, useEffect, useRef } from "react";

type PutFn = (
  message: string,
  isShareEnd?: boolean,
  displayTimeMs?: number
) => void;

type MessageFactory = () =>
  | {
      text?: string;
      isShareEnd?: boolean;
    }
  | null;

interface UseOneShotSlowHintOptions {
  thresholdMs: number;
  putMessageInMs: PutFn;
  getMessage: MessageFactory;
  visibilityGate?: boolean; // default true: only show when document is visible
  displayMs?: number; // default 6000
}

// A small utility hook to manage a one-shot slow-hint timer per attempt.
// - arm(): start a timer if not already started
// - disarm(): clear running timer (does not reset shown flag)
// - reset(): clear timer and reset once-shown & pending flags
export function useOneShotSlowHint({
  thresholdMs,
  putMessageInMs,
  getMessage,
  visibilityGate = true,
  displayMs = 6000,
}: UseOneShotSlowHintOptions) {
  const timerRef = useRef<number | null>(null);
  const shownRef = useRef<boolean>(false);
  const pendingRef = useRef<boolean>(false);

  const disarm = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    disarm();
    shownRef.current = false;
    pendingRef.current = false;
  }, [disarm]);

  const fireIfEligible = useCallback(() => {
    if (shownRef.current) return;
    const payload = getMessage();
    if (!payload || !payload.text) return;
    if (visibilityGate) {
      if (typeof document === "undefined") {
        // In SSR, defer showing until client becomes visible
        pendingRef.current = true;
        return;
      }
      if (document.visibilityState !== "visible") {
        pendingRef.current = true;
        return;
      }
    }
    putMessageInMs(payload.text, payload.isShareEnd, displayMs);
    shownRef.current = true;
    pendingRef.current = false;
  }, [displayMs, getMessage, putMessageInMs, visibilityGate]);

  const arm = useCallback(
    (_key?: string) => {
      if (timerRef.current) return; // already armed
      // Use global setTimeout to avoid SSR window reference
      timerRef.current = setTimeout(() => {
        fireIfEligible();
      }, thresholdMs) as unknown as number;
    },
    [fireIfEligible, thresholdMs]
  );

  // Visibility change handling: if pending, try to fire once when visible
  useEffect(() => {
    if (!visibilityGate) return;
    if (typeof document === "undefined") return;
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (pendingRef.current && !shownRef.current) {
        fireIfEligible();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fireIfEligible, visibilityGate]);

  // Cleanup on unmount
  useEffect(() => () => disarm(), [disarm]);

  return { arm, disarm, reset } as const;
}
