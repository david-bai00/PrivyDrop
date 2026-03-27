import { useEffect, useRef } from "react";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { mapPhase, type Phase } from "@/utils/rtcPhase";
import { useOneShotSlowHint } from "@/utils/useOneShotSlowHint";
import type { ConnectionFeedbackText } from "@/types/clipboardText";

interface UseConnectionFeedbackProps {
  text: ConnectionFeedbackText;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useConnectionFeedback({
  text,
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
  // Which side first entered negotiating, to infer message side
  const rtcSlowTriggerSideRef = useRef<"share" | "recv" | null>(null);

  // One-shot slow hint for negotiating ≥ 8s (front-visible, once per attempt)
  const { arm: armRtcSlow, disarm: disarmRtcSlow, reset: resetRtcSlow } = useOneShotSlowHint({
    thresholdMs: 8000,
    putMessageInMs,
    displayMs: 6000,
    getMessage: () => {
      if (!text.slow) return null;
      const isShareEnd =
        rtcSlowTriggerSideRef.current === "share"
          ? true
          : rtcSlowTriggerSideRef.current === "recv"
          ? false
          : sharePhaseRef.current === "negotiating";
      return { text: text.slow, isShareEnd };
    },
    visibilityGate: true,
  });

  // Bridge RTC connection state changes to UI messages
  useEffect(() => {
    const nowShare: Phase = mapPhase(shareConnectionState as any);
    const nowRecv: Phase = mapPhase(retrieveConnectionState as any);

    const prevShare = prevShareRef.current;
    const prevRecv = prevRecvRef.current;

    // Update refs for visibility handler to read latest
    sharePhaseRef.current = nowShare;
    recvPhaseRef.current = nowRecv;

     // Sender side mapping
    if (nowShare === "negotiating" && prevShare !== "negotiating") {
        const msg = text.negotiating;
       if (msg) putMessageInMs(msg, true, 4000);
      if (!rtcSlowTriggerSideRef.current) rtcSlowTriggerSideRef.current = "share";
      armRtcSlow("rtc-negotiating");
    }
    if (nowShare === "connected") {
        if (!everShareRef.current) {
          const msg = text.connected;
         if (msg) putMessageInMs(msg, true, 4000);
        }
        if (wasDiscShareRef.current) {
          const msg = text.restored;
         if (msg) putMessageInMs(msg, true, 4000);
       }
      everShareRef.current = true;
      wasDiscShareRef.current = false;
      disarmRtcSlow();
    }
    if (nowShare === "disconnected") {
       const isForeground =
         typeof document !== "undefined" && document.visibilityState === "visible";
       if ((everShareRef.current || wasDiscShareRef.current) && isForeground) {
          const msg = text.reconnecting;
         if (msg) putMessageInMs(msg, true, 4000);
        wasDiscShareRef.current = true;
      }
      disarmRtcSlow();
    }

     // Receiver side mapping
    if (nowRecv === "negotiating" && prevRecv !== "negotiating") {
        const msg = text.negotiating;
       if (msg) putMessageInMs(msg, false, 4000);
      if (!rtcSlowTriggerSideRef.current) rtcSlowTriggerSideRef.current = "recv";
      armRtcSlow("rtc-negotiating");
    }
    if (nowRecv === "connected") {
        if (!everRecvRef.current) {
          const msg = text.connected;
         if (msg) putMessageInMs(msg, false, 4000);
        }
        if (wasDiscRecvRef.current) {
          const msg = text.restored;
         if (msg) putMessageInMs(msg, false, 4000);
       }
      everRecvRef.current = true;
      wasDiscRecvRef.current = false;
      disarmRtcSlow();
    }
    if (nowRecv === "disconnected") {
       const isForeground =
         typeof document !== "undefined" && document.visibilityState === "visible";
       if ((everRecvRef.current || wasDiscRecvRef.current) && isForeground) {
          const msg = text.reconnecting;
         if (msg) putMessageInMs(msg, false, 4000);
        wasDiscRecvRef.current = true;
      }
      disarmRtcSlow();
    }

    // If both sides are not negotiating, reset slow hint state for next attempt
    if (nowShare !== "negotiating" && nowRecv !== "negotiating") {
      resetRtcSlow();
      rtcSlowTriggerSideRef.current = null;
    }

    // Save previous for next comparison
    prevShareRef.current = nowShare;
    prevRecvRef.current = nowRecv;
  }, [text, shareConnectionState, retrieveConnectionState, putMessageInMs, armRtcSlow, disarmRtcSlow, resetRtcSlow]);

  // Visibility change: when returning to foreground, if still disconnected, hint "reconnecting"
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      const nowShare = sharePhaseRef.current;
      const nowRecv = recvPhaseRef.current;

       if (
         (everShareRef.current || wasDiscShareRef.current) &&
         nowShare === "disconnected"
       ) {
          const msg = text.reconnecting;
         if (msg) putMessageInMs(msg, true, 4000);
        wasDiscShareRef.current = true;
      }
       if (
         (everRecvRef.current || wasDiscRecvRef.current) &&
         nowRecv === "disconnected"
       ) {
          const msg = text.reconnecting;
         if (msg) putMessageInMs(msg, false, 4000);
        wasDiscRecvRef.current = true;
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }
    return;
  }, [text.reconnecting, putMessageInMs]);
}
