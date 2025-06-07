import React from "react";
import { Clipboard, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClipboardActions } from "@/hooks/useClipboardActions";

interface WriteClipboardButtonProps {
  title?: string; // Made title optional, can use default from messages
  textToCopy: string;
}

interface ReadClipboardButtonProps {
  title?: string; // Made title optional
  onRead: (text: string) => void;
}

export const WriteClipboardButton: React.FC<WriteClipboardButtonProps> = ({
  title,
  textToCopy,
}) => {
  const { copyText, isCopied, isLoadingMessages, clipboardMessages, error } =
    useClipboardActions();

  const buttonText = title || clipboardMessages.copyError || "Copy"; // Fallback title

  if (isLoadingMessages && !clipboardMessages.copiedSuccess) {
    // Only show loading if messages truly not ready
    return (
      <Button variant="outline" disabled>
        {clipboardMessages.loading || "Loading..."}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={() => copyText(textToCopy)}
      disabled={isCopied || isLoadingMessages}
    >
      {isCopied ? (
        <>
          <Check className="w-4 h-4 mr-2" />
          {clipboardMessages.copiedSuccess}
        </>
      ) : (
        <>
          <FileText className="mr-2 h-4 w-4" /> {buttonText}
        </>
      )}
      {/* Optionally display error */}
      {/* {error && <span className="ml-2 text-red-500">{error}</span>} */}
    </Button>
  );
};

export const ReadClipboardButton: React.FC<ReadClipboardButtonProps> = ({
  title,
  onRead,
}) => {
  const {
    readClipboard,
    isPasted,
    isLoadingMessages,
    clipboardMessages,
    error,
  } = useClipboardActions();

  const handleRead = async () => {
    const text = await readClipboard();
    onRead(text); // Pass null if read failed or no suitable content
  };

  const buttonText = title || clipboardMessages.readError || "Paste"; // Fallback title

  if (isLoadingMessages && !clipboardMessages.pastedSuccess) {
    // Only show loading if messages truly not ready
    return (
      <Button variant="outline" disabled>
        {clipboardMessages.loading || "Loading..."}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={handleRead}
      disabled={isPasted || isLoadingMessages}
    >
      {isPasted ? (
        <>
          <Check className="w-4 h-4 mr-2" />
          {clipboardMessages.pastedSuccess}
        </>
      ) : (
        <>
          <Clipboard className="w-4 h-4 mr-2" /> {buttonText}
        </>
      )}
      {/* Optionally display error */}
      {/* {error && <span className="ml-2 text-red-500">{error}</span>} */}
    </Button>
  );
};
