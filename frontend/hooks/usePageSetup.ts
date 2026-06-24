import { useEffect, useRef } from "react";
import { trackReferrer } from "@/lib/tracking";

interface UsePageSetupProps {
  setRetrieveRoomId: (roomId: string) => void;
  setActiveTab: (tab: "send" | "retrieve") => void;
  autoJoinReceiverRoom: (
    source: "auto:url" | "auto:cached",
    roomId: string
  ) => Promise<unknown> | void;
}

export function usePageSetup({
  setRetrieveRoomId,
  setActiveTab,
  autoJoinReceiverRoom,
}: UsePageSetupProps) {
  const autoJoinReceiverRoomRef = useRef(autoJoinReceiverRoom);

  useEffect(() => {
    autoJoinReceiverRoomRef.current = autoJoinReceiverRoom;
  }, [autoJoinReceiverRoom]);

  // Track referrer and handle URL 'roomId' parameter
  useEffect(() => {
    // Guard in SSR
    if (typeof window === "undefined") return;
    trackReferrer(); // Call on component mount

    const urlParams = new URLSearchParams(window.location.search);
    const roomIdParam = urlParams.get("roomId");

    if (roomIdParam) {
      setRetrieveRoomId(roomIdParam);
      setActiveTab("retrieve");
      const timeoutId = setTimeout(() => {
        void autoJoinReceiverRoomRef.current("auto:url", roomIdParam);
      }, 0);
      return () => clearTimeout(timeoutId); // Cleanup timeout
    }
  }, [setRetrieveRoomId, setActiveTab]);

}
