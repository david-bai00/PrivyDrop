import { useEffect } from "react";
import { trackReferrer } from "@/lib/tracking";

interface UsePageSetupProps {
  setRetrieveRoomId: (roomId: string) => void;
  setActiveTab: (tab: "send" | "retrieve") => void;
  retrieveJoinRoomBtnRef: React.RefObject<HTMLButtonElement>;
}

export function usePageSetup({
  setRetrieveRoomId,
  setActiveTab,
  retrieveJoinRoomBtnRef,
}: UsePageSetupProps) {
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
      // Ensure DOM is updated and ref is available before clicking
      const timeoutId = setTimeout(() => {
        retrieveJoinRoomBtnRef.current?.click();
      }, 200);
      return () => clearTimeout(timeoutId); // Cleanup timeout
    }
  }, [setRetrieveRoomId, setActiveTab, retrieveJoinRoomBtnRef]); // Dependencies are stable setters and a ref

}
