import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/tracking";
import { useFileTransferStore } from "@/stores/fileTransferStore";

/**
 * Funnel instrumentation for the clipboard app.
 *
 * Why this lives in its own hook instead of inside the WebRTC/room hooks:
 * the transfer pipeline is the most delicate code in the product (mid-transfer
 * edits have caused regressions before). Observability must never be allowed to
 * perturb it, so we observe the *published store state* from the outside and
 * react to transitions. A side effect that can throw inside the connection
 * setup path is exactly the kind of risk this avoids.
 *
 * Events produced:
 *   receive_invite_landing visitor arrived through a shared roomId link
 *   room_join              sender entered a room and can start sharing
 *   receive_join           receiver connected to a sender room
 *   transfer_start         receiver received at least one item
 *   transfer_complete      one per delivered item (repeatable, delta-based)
 */
export function useFunnelTracking(): void {
  const isSenderInRoom = useFileTransferStore((s) => s.isSenderInRoom);
  const isReceiverInRoom = useFileTransferStore((s) => s.isReceiverInRoom);
  const retrievedContent = useFileTransferStore((s) => s.retrievedContent);
  const retrievedFiles = useFileTransferStore((s) => s.retrievedFiles);

  const deliveredCount =
    retrievedContent.trim().length > 0 ? retrievedFiles.length + 1 : retrievedFiles.length;

  // How many items have already been counted, so re-renders and reconnects
  // never double count a delivery.
  const countedDeliveries = useRef(0);

  // A visitor who landed on a shared room link is the single most valuable
  // acquisition event in the product: a sender explicitly invited them.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const invited = new URLSearchParams(window.location.search).has("roomId");
    if (invited) {
      trackEvent("receive_invite_landing", { dedupe: true });
    }
  }, []);

  useEffect(() => {
    if (isSenderInRoom) {
      trackEvent("room_join", { dedupe: true });
    }
  }, [isSenderInRoom]);

  useEffect(() => {
    if (isReceiverInRoom) {
      trackEvent("receive_join", { dedupe: true });
    }
  }, [isReceiverInRoom]);

  useEffect(() => {
    if (deliveredCount === 0) return;

    if (countedDeliveries.current === 0) {
      trackEvent("transfer_start", { dedupe: true });
    }

    // Repeatable on purpose: delivering five files is five completions, and
    // the delta is the real engagement signal.
    while (countedDeliveries.current < deliveredCount) {
      countedDeliveries.current += 1;
      trackEvent("transfer_complete", { dedupe: false });
    }
  }, [deliveredCount]);
}
