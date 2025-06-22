import { useState, useEffect } from "react";
import { getDictionary } from "@/lib/dictionary";
import { useLocale } from "@/hooks/useLocale";
import { trackReferrer } from "@/lib/tracking";
import type { Messages } from "@/types/messages";

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
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  // Load internationalization messages
  useEffect(() => {
    setIsLoadingMessages(true);
    getDictionary(locale)
      .then((dict) => {
        setMessages(dict);
      })
      .catch((error) => {
        console.error("Failed to load messages:", error);
        // Optionally set some default/fallback messages or an error state
        setMessages(null); // Or some error indicator
      })
      .finally(() => {
        setIsLoadingMessages(false);
      });
  }, [locale]);

  // Track referrer and handle URL 'roomId' parameter
  useEffect(() => {
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

  return { messages, isLoadingMessages };
}
