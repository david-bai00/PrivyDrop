import { useEffect, useRef } from "react";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { mapPhase, type Phase } from "@/utils/rtcPhase";
import { useOneShotSlowHint } from "@/utils/useOneShotSlowHint";
import type { ConnectionFeedbackText } from "@/types/clipboardText";
import type { SideMessageDispatcher } from "@/hooks/useClipboardAppMessages";

interface UseConnectionFeedbackProps {
  text: ConnectionFeedbackText;
  showSenderMessage: SideMessageDispatcher;
  showReceiverMessage: SideMessageDispatcher;
}

export function useConnectionFeedback({
  text,
  showSenderMessage,
  showReceiverMessage,
}: UseConnectionFeedbackProps) {
  const {
    shareConnectionState,
    retrieveConnectionState,
    shareLifecycleState,
    retrieveLifecycleState,
  } = useFileTransferStore();

  // Track previous phases and connection history via refs
  const prevShareRef = useRef<Phase>("idle");
  const prevRecvRef = useRef<Phase>("idle");
  const prevShareLifecycleRef = useRef<string>("idle");
  const prevRecvLifecycleRef = useRef<string>("idle");
  const everShareRef = useRef<boolean>(false);
  const everRecvRef = useRef<boolean>(false);
  const wasDiscShareRef = useRef<boolean>(false);
  const wasDiscRecvRef = useRef<boolean>(false);
  const sharePhaseRef = useRef<Phase>("idle");
  const recvPhaseRef = useRef<Phase>("idle");
  // Which side first entered negotiating, to infer message side
  const rtcSlowTriggerSideRef = useRef<"share" | "recv" | null>(null);

  // One-shot slow hint for negotiating ≥ 8s (front-visible, once per attempt)
  const { arm: armRtcSlow, disarm: disarmRtcSlow, reset: resetRtcSlow } =
    useOneShotSlowHint({
      thresholdMs: 8000,
      displayMs: 6000,
      getMessage: () => {
        if (!text.slow) {
          return null;
        }

        const showMessage =
          rtcSlowTriggerSideRef.current === "share"
            ? showSenderMessage
            : rtcSlowTriggerSideRef.current === "recv"
              ? showReceiverMessage
              : sharePhaseRef.current === "negotiating"
                ? showSenderMessage
                : showReceiverMessage;

        return { text: text.slow, showMessage };
      },
      visibilityGate: true,
    });

  // Bridge RTC connection state changes to UI messages
  useEffect(() => {
    const currentShareState = shareLifecycleState || shareConnectionState;
    const currentRecvState = retrieveLifecycleState || retrieveConnectionState;
    const nowShare: Phase = mapPhase(currentShareState);
    const nowRecv: Phase = mapPhase(currentRecvState);

    const prevShare = prevShareRef.current;
    const prevRecv = prevRecvRef.current;
    const prevShareLifecycle = prevShareLifecycleRef.current;
    const prevRecvLifecycle = prevRecvLifecycleRef.current;

    // Update refs for visibility handler to read latest
    sharePhaseRef.current = nowShare;
    recvPhaseRef.current = nowRecv;

    // Sender side mapping
    if (nowShare === "negotiating" && prevShare !== "negotiating") {
      const msg = text.negotiating;
      if (msg) {
        showSenderMessage(msg, 4000);
      }
      if (!rtcSlowTriggerSideRef.current) rtcSlowTriggerSideRef.current = "share";
      armRtcSlow("rtc-negotiating");
    }
    if (nowShare === "connected") {
      if (!everShareRef.current) {
        const msg = text.connected;
        if (msg) {
          showSenderMessage(msg, 4000);
        }
      }
      if (wasDiscShareRef.current) {
        const msg = text.restored;
        if (msg) {
          showSenderMessage(msg, 4000);
        }
      }
      everShareRef.current = true;
      wasDiscShareRef.current = false;
      disarmRtcSlow();
    }
    if (currentShareState === "reconnecting") {
      const isForeground =
        typeof document !== "undefined" && document.visibilityState === "visible";
      if (prevShareLifecycle !== "reconnecting" && isForeground) {
        const msg = text.reconnecting;
        if (msg) {
          showSenderMessage(msg, 4000);
        }
      }
      wasDiscShareRef.current = true;
      disarmRtcSlow();
    } else if (nowShare === "disconnected") {
      const isForeground =
        typeof document !== "undefined" && document.visibilityState === "visible";
      if ((everShareRef.current || wasDiscShareRef.current) && isForeground) {
        const msg = text.reconnecting;
        if (msg) {
          showSenderMessage(msg, 4000);
        }
        wasDiscShareRef.current = true;
      }
      disarmRtcSlow();
    }

    // Receiver side mapping
    if (nowRecv === "negotiating" && prevRecv !== "negotiating") {
      const msg = text.negotiating;
      if (msg) {
        showReceiverMessage(msg, 4000);
      }
      if (!rtcSlowTriggerSideRef.current) rtcSlowTriggerSideRef.current = "recv";
      armRtcSlow("rtc-negotiating");
    }
    if (nowRecv === "connected") {
      if (!everRecvRef.current) {
        const msg = text.connected;
        if (msg) {
          showReceiverMessage(msg, 4000);
        }
      }
      if (wasDiscRecvRef.current) {
        const msg = text.restored;
        if (msg) {
          showReceiverMessage(msg, 4000);
        }
      }
      everRecvRef.current = true;
      wasDiscRecvRef.current = false;
      disarmRtcSlow();
    }
    if (currentRecvState === "reconnecting") {
      const isForeground =
        typeof document !== "undefined" && document.visibilityState === "visible";
      if (prevRecvLifecycle !== "reconnecting" && isForeground) {
        const msg = text.reconnecting;
        if (msg) {
          showReceiverMessage(msg, 4000);
        }
      }
      wasDiscRecvRef.current = true;
      disarmRtcSlow();
    } else if (nowRecv === "disconnected") {
      const isForeground =
        typeof document !== "undefined" && document.visibilityState === "visible";
      if ((everRecvRef.current || wasDiscRecvRef.current) && isForeground) {
        const msg = text.reconnecting;
        if (msg) {
          showReceiverMessage(msg, 4000);
        }
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
    prevShareLifecycleRef.current = currentShareState;
    prevRecvLifecycleRef.current = currentRecvState;
  }, [
    text,
    shareConnectionState,
    retrieveConnectionState,
    shareLifecycleState,
    retrieveLifecycleState,
    showSenderMessage,
    showReceiverMessage,
    armRtcSlow,
    disarmRtcSlow,
    resetRtcSlow,
  ]);

  // Visibility change: when returning to foreground, if still disconnected, hint "reconnecting"
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      const nowShare = sharePhaseRef.current;
      const nowRecv = recvPhaseRef.current;

      if (
        (everShareRef.current || wasDiscShareRef.current) &&
        (prevShareLifecycleRef.current === "reconnecting" ||
          nowShare === "disconnected")
      ) {
        const msg = text.reconnecting;
        if (msg) {
          showSenderMessage(msg, 4000);
        }
        wasDiscShareRef.current = true;
      }
      if (
        (everRecvRef.current || wasDiscRecvRef.current) &&
        (prevRecvLifecycleRef.current === "reconnecting" ||
          nowRecv === "disconnected")
      ) {
        const msg = text.reconnecting;
        if (msg) {
          showReceiverMessage(msg, 4000);
        }
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
  }, [text.reconnecting, showSenderMessage, showReceiverMessage]);
}
