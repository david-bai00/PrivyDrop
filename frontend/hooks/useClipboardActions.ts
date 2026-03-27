import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

interface ClipboardMessages {
  copiedSuccess?: string;
  pastedSuccess?: string;
  copyError?: string;
  readError?: string;
  loading?: string;
}

interface ClipboardActions {
  copyText: (text: string) => Promise<void>;
  readClipboard: () => Promise<string>;
  isCopied: boolean;
  isPasted: boolean;
  isLoadingMessages: boolean;
  error: string | null;
  clipboardMessages: ClipboardMessages;
}

export const useClipboardActions = (): ClipboardActions => {
  const tClipboard = useTranslations("text.common.clipboard");
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isPasted, setIsPasted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clipboardMessages = useMemo<ClipboardMessages>(
    () => ({
      copiedSuccess: tClipboard("copied"),
      pastedSuccess: tClipboard("pasted"),
      copyError: tClipboard("copyError"),
      readError: tClipboard("readError"),
      loading: tClipboard("loading"),
    }),
    [tClipboard]
  );

  const copyText = useCallback(
    async (textToCopy: string) => {
      setError(null);
      setIsCopied(false);

      // Modern API: navigator.clipboard.writeText
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
          return; // Success
        } catch (err) {
          console.error("Failed to copy text with navigator.clipboard: ", err);
          // Fallback will be attempted below
        }
      }

      // Fallback: document.execCommand('copy')
      let textArea: HTMLTextAreaElement | null = null;
      try {
        textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed"; // Prevent scrolling to bottom of page in MS Edge.
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        if (successful) {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } else {
          throw new Error("document.execCommand failed");
        }
      } catch (err) {
        console.error("Fallback copy method failed: ", err);
         setError(clipboardMessages.copyError || tClipboard("copyError"));
      } finally {
        if (textArea) {
          document.body.removeChild(textArea);
        }
      }
    },
    [clipboardMessages.copyError]
  );

  const readClipboard = useCallback(async (): Promise<string> => {
    setError(null);
    setIsPasted(false);
    if (!navigator.clipboard) {
       setError(clipboardMessages.readError || tClipboard("readError"));
      return "";
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
         clipboardMessages.readError || tClipboard("readError")
      );
      return "";
    } catch (err) {
      try {
        const text = await navigator.clipboard.readText();
        const formattedText = text.replace(/\n/g, "<br>");
        setIsPasted(true);
        setTimeout(() => setIsPasted(false), 2000);
        return formattedText;
      } catch (fallbackErr) {
        console.error("Failed to read clipboard: ", fallbackErr);
         setError(clipboardMessages.readError || tClipboard("readError"));
         return "";
       }
     }
   }, [clipboardMessages.readError, tClipboard]);

  return {
    copyText,
    readClipboard,
    isCopied,
    isPasted,
    isLoadingMessages: false,
    error,
    clipboardMessages,
  };
};
