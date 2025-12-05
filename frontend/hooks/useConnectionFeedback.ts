import { useEffect, useRef } from "react";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import type { Messages } from "@/types/messages";

type Phase = "idle" | "negotiating" | "connected" | "disconnected";
const SLOW_RTC_MS = 8000; // 8s threshold for slow P2P negotiation

function mapPhase(state?: string): Phase {
  if (!state) return "idle";
  if (state === "new" || state === "connecting") return "negotiating";
  if (state === "connected") return "connected";
  if (state === "disconnected" || state === "failed" || state === "closed")
    return "disconnected";
  // store may already map to these values
  if (
    state === "idle" ||
    (state as any) === "negotiating" ||
    (state as any) === "disconnected"
  )
    return state as Phase;
  return "idle";
}

interface UseConnectionFeedbackProps {
  messages: Messages | null;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useConnectionFeedback({
  messages,
  putMessageInMs,
}: UseConnectionFeedbackProps) {
  const { shareConnectionState, retrieveConnectionState } =
    useFileTransferStore();

  // Track previous phases and connection history via refs
  const prevShareRef = useRef<Phase>("idle");
  const prevRecvRef = useRef<Phase>("idle");
  const everShareRef = useRef<boolean>(false);
  const everRecvRef = useRef<boolean>(false);
  const wasDiscShareRef = useRef<boolean>(false);
  const wasDiscRecvRef = useRef<boolean>(false);
  const sharePhaseRef = useRef<Phase>("idle");
  const recvPhaseRef = useRef<Phase>("idle");
  // Slow negotiation hint management
  const slowTimerShareRef = useRef<number | null>(null);
  const slowTimerRecvRef = useRef<number | null>(null);
  const slowShownRef = useRef<boolean>(false);
  const slowTriggerSideRef = useRef<"share" | "recv" | null>(null);
  const slowPendingRef = useRef<boolean>(false);

  // Bridge RTC connection state changes to UI messages
  useEffect(() => {
    if (!messages) return;

    const nowShare: Phase = mapPhase(shareConnectionState as any);
    const nowRecv: Phase = mapPhase(retrieveConnectionState as any);

    const prevShare = prevShareRef.current;
    const prevRecv = prevRecvRef.current;

    // Update refs for visibility handler to read latest
    sharePhaseRef.current = nowShare;
    recvPhaseRef.current = nowRecv;

    // Helper: start slow negotiation timer for a side
    const startSlowTimer = (side: "share" | "recv") => {
      if (side === "share") {
        if (slowTimerShareRef.current) return;
        if (!slowTriggerSideRef.current) slowTriggerSideRef.current = "share";
        slowTimerShareRef.current = window.setTimeout(() => {
          // Only show if still negotiating at timeout
          const stillNegotiating =
            sharePhaseRef.current === "negotiating" ||
            recvPhaseRef.current === "negotiating";
          if (!stillNegotiating || slowShownRef.current) return;
          if (document.visibilityState !== "visible") {
            slowPendingRef.current = true;
            return;
          }
          const msg = messages.text.ClipboardApp.rtc_slow;
          if (msg) {
            const isShareEnd =
              slowTriggerSideRef.current === "share"
                ? true
                : slowTriggerSideRef.current === "recv"
                ? false
                : sharePhaseRef.current === "negotiating";
            putMessageInMs(msg, isShareEnd, 6000);
            slowShownRef.current = true;
          }
        }, SLOW_RTC_MS) as unknown as number;
      } else {
        if (slowTimerRecvRef.current) return;
        if (!slowTriggerSideRef.current) slowTriggerSideRef.current = "recv";
        slowTimerRecvRef.current = window.setTimeout(() => {
          const stillNegotiating =
            sharePhaseRef.current === "negotiating" ||
            recvPhaseRef.current === "negotiating";
          if (!stillNegotiating || slowShownRef.current) return;
          if (document.visibilityState !== "visible") {
            slowPendingRef.current = true;
            return;
          }
          const msg = messages.text.ClipboardApp.rtc_slow;
          if (msg) {
            const isShareEnd =
              slowTriggerSideRef.current === "share"
                ? true
                : slowTriggerSideRef.current === "recv"
                ? false
                : sharePhaseRef.current === "negotiating";
            putMessageInMs(msg, isShareEnd, 6000);
            slowShownRef.current = true;
          }
        }, SLOW_RTC_MS) as unknown as number;
      }
    };

    const clearSlowTimer = (side: "share" | "recv") => {
      if (side === "share" && slowTimerShareRef.current) {
        clearTimeout(slowTimerShareRef.current);
        slowTimerShareRef.current = null;
      }
      if (side === "recv" && slowTimerRecvRef.current) {
        clearTimeout(slowTimerRecvRef.current);
        slowTimerRecvRef.current = null;
      }
    };

    // Sender side mapping
    if (nowShare === "negotiating" && prevShare !== "negotiating") {
      const msg = messages.text.ClipboardApp.rtc_negotiating;
      if (msg) putMessageInMs(msg, true, 4000);
      startSlowTimer("share");
    }
    if (nowShare === "connected") {
      if (!everShareRef.current) {
        const msg = messages.text.ClipboardApp.rtc_connected;
        if (msg) putMessageInMs(msg, true, 4000);
      }
      if (wasDiscShareRef.current) {
        const msg = messages.text.ClipboardApp.rtc_restored;
        if (msg) putMessageInMs(msg, true, 4000);
      }
      everShareRef.current = true;
      wasDiscShareRef.current = false;
      clearSlowTimer("share");
    }
    if (nowShare === "disconnected") {
      const isForeground = document.visibilityState === "visible";
      if ((everShareRef.current || wasDiscShareRef.current) && isForeground) {
        const msg = messages.text.ClipboardApp.rtc_reconnecting;
        if (msg) putMessageInMs(msg, true, 4000);
        wasDiscShareRef.current = true;
      }
      clearSlowTimer("share");
    }

    // Receiver side mapping
    if (nowRecv === "negotiating" && prevRecv !== "negotiating") {
      const msg = messages.text.ClipboardApp.rtc_negotiating;
      if (msg) putMessageInMs(msg, false, 4000);
      startSlowTimer("recv");
    }
    if (nowRecv === "connected") {
      if (!everRecvRef.current) {
        const msg = messages.text.ClipboardApp.rtc_connected;
        if (msg) putMessageInMs(msg, false, 4000);
      }
      if (wasDiscRecvRef.current) {
        const msg = messages.text.ClipboardApp.rtc_restored;
        if (msg) putMessageInMs(msg, false, 4000);
      }
      everRecvRef.current = true;
      wasDiscRecvRef.current = false;
      clearSlowTimer("recv");
    }
    if (nowRecv === "disconnected") {
      const isForeground = document.visibilityState === "visible";
      if ((everRecvRef.current || wasDiscRecvRef.current) && isForeground) {
        const msg = messages.text.ClipboardApp.rtc_reconnecting;
        if (msg) putMessageInMs(msg, false, 4000);
        wasDiscRecvRef.current = true;
      }
      clearSlowTimer("recv");
    }

    // If both sides are not negotiating, reset slow hint state for next attempt
    if (nowShare !== "negotiating" && nowRecv !== "negotiating") {
      slowShownRef.current = false;
      slowTriggerSideRef.current = null;
      slowPendingRef.current = false;
      clearSlowTimer("share");
      clearSlowTimer("recv");
    }

    // Save previous for next comparison
    prevShareRef.current = nowShare;
    prevRecvRef.current = nowRecv;
  }, [messages, shareConnectionState, retrieveConnectionState, putMessageInMs]);

  // Visibility change: when returning to foreground, if still disconnected, hint "reconnecting"
  useEffect(() => {
    if (!messages) return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const nowShare = sharePhaseRef.current;
      const nowRecv = recvPhaseRef.current;

      if (
        (everShareRef.current || wasDiscShareRef.current) &&
        nowShare === "disconnected"
      ) {
        const msg = messages.text.ClipboardApp.rtc_reconnecting;
        if (msg) putMessageInMs(msg, true, 4000);
        wasDiscShareRef.current = true;
      }
      if (
        (everRecvRef.current || wasDiscRecvRef.current) &&
        nowRecv === "disconnected"
      ) {
        const msg = messages.text.ClipboardApp.rtc_reconnecting;
        if (msg) putMessageInMs(msg, false, 4000);
        wasDiscRecvRef.current = true;
      }

      // If a slow hint was pending while hidden and still negotiating, show it once
      if (
        slowPendingRef.current &&
        !slowShownRef.current &&
        (nowShare === "negotiating" || nowRecv === "negotiating")
      ) {
        const msg = messages.text.ClipboardApp.rtc_slow;
        if (msg) {
          const isShareEnd =
            slowTriggerSideRef.current === "share"
              ? true
              : slowTriggerSideRef.current === "recv"
              ? false
              : nowShare === "negotiating";
          putMessageInMs(msg, isShareEnd, 6000);
          slowShownRef.current = true;
          slowPendingRef.current = false;
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [messages, putMessageInMs]);

  // Cleanup on unmount: clear any running timers
  useEffect(() => {
    return () => {
      if (slowTimerShareRef.current) clearTimeout(slowTimerShareRef.current);
      if (slowTimerRecvRef.current) clearTimeout(slowTimerRecvRef.current);
    };
  }, []);
}
