import { useState, useCallback, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import { getDictionary } from "@/lib/dictionary";
import type { Messages } from "@/types/messages";

interface ClipboardMessages {
  copiedSuccess?: string;
  pastedSuccess?: string;
  copyError?: string;
  readError?: string;
  loading?: string;
}

interface ClipboardActions {
  copyText: (text: string) => Promise<void>;
  readClipboard: () => Promise<string | null>;
  isCopied: boolean;
  isPasted: boolean;
  isLoadingMessages: boolean;
  error: string | null;
  clipboardMessages: ClipboardMessages;
}

export const useClipboardActions = (): ClipboardActions => {
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isPasted, setIsPasted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [clipboardMessages, setClipboardMessages] = useState<ClipboardMessages>(
    {}
  );

  useEffect(() => {
    setIsLoadingMessages(true);
    getDictionary(locale)
      .then((dict) => {
        setMessages(dict);
        setClipboardMessages({
          copiedSuccess: dict.text.clipboard_btn.Copied_dis,
          pastedSuccess: dict.text.clipboard_btn.Pasted_dis,
          copyError:
            dict.text.clipboard_btn.Copy_failed_dis || "Failed to copy.", // Fallback
          readError:
            dict.text.clipboard_btn.Paste_failed_dis ||
            "Failed to read clipboard.", // Fallback
          loading: dict.text.Loading_dis || "Loading...", // Fallback
        });
        setIsLoadingMessages(false);
      })
      .catch((err) => {
        console.error("Failed to load messages for useClipboardActions:", err);
        setError("Failed to load messages");
        setClipboardMessages({
          // Provide fallbacks even on error
          copyError: "Failed to copy.",
          readError: "Failed to read clipboard.",
          loading: "Loading...",
        });
        setIsLoadingMessages(false);
      });
  }, [locale]);

  const copyText = useCallback(
    async (textToCopy: string) => {
      setError(null);
      setIsCopied(false);
      if (!navigator.clipboard) {
        setError(clipboardMessages.copyError || "Clipboard API not available.");
        return;
      }
      try {
        await navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy text: ", err);
        setError(clipboardMessages.copyError || "Failed to copy.");
      }
    },
    [clipboardMessages.copyError]
  );

  const readClipboard = useCallback(async (): Promise<string | null> => {
    setError(null);
    setIsPasted(false);
    if (!navigator.clipboard) {
      setError(clipboardMessages.readError || "Clipboard API not available.");
      return null;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        if (clipboardItem.types.includes("text/html")) {
          const blob = await clipboardItem.getType("text/html");
          const html = await blob.text();
          setIsPasted(true);
          setTimeout(() => setIsPasted(false), 2000);
          return html;
        }
        if (clipboardItem.types.includes("text/plain")) {
          const blob = await clipboardItem.getType("text/plain");
          const text = await blob.text();
          const formattedText = text.replace(/\n/g, "<br>");
          setIsPasted(true);
          setTimeout(() => setIsPasted(false), 2000);
          return formattedText;
        }
      }
      console.warn("No suitable content type found in clipboard.");
      setError(
        clipboardMessages.readError || "No suitable content type found."
      );
      return null;
    } catch (err) {
      try {
        const text = await navigator.clipboard.readText();
        const formattedText = text.replace(/\n/g, "<br>");
        setIsPasted(true);
        setTimeout(() => setIsPasted(false), 2000);
        return formattedText;
      } catch (fallbackErr) {
        console.error("Failed to read clipboard: ", fallbackErr);
        setError(clipboardMessages.readError || "Failed to read clipboard.");
        return null;
      }
    }
  }, [clipboardMessages.readError]);

  return {
    copyText,
    readClipboard,
    isCopied,
    isPasted,
    isLoadingMessages,
    error,
    clipboardMessages,
  };
};
