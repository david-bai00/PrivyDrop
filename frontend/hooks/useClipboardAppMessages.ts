import { useState } from "react";

export interface AppMessages {
  shareMessage: string;
  retrieveMessage: string;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useClipboardAppMessages(): AppMessages {
  const [shareMessage, setShareMessage] = useState("");
  const [retrieveMessage, setRetrieveMessage] = useState("");

  const putMessageInMs = (
    message: string,
    isShareEnd = true,
    displayTimeMs = 4000
  ) => {
    if (isShareEnd) {
      setShareMessage(message);
      setTimeout(() => setShareMessage(""), displayTimeMs);
    } else {
      setRetrieveMessage(message);
      setTimeout(() => setRetrieveMessage(""), displayTimeMs);
    }
  };

  return {
    shareMessage,
    retrieveMessage,
    putMessageInMs,
  };
}
