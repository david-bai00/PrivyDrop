import type { ClipboardMessageSide } from "@/hooks/useClipboardAppMessages";
import { useClipboardAppSideMessage } from "@/hooks/useClipboardAppMessages";

interface ClipboardSideMessageProps {
  side: ClipboardMessageSide;
}

export function ClipboardSideMessage({
  side,
}: ClipboardSideMessageProps) {
  const message = useClipboardAppSideMessage(side);

  if (!message) {
    return null;
  }

  return <p className="mt-3 text-sm text-primary">{message}</p>;
}
