import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type SideMessageDispatcher = (
  message: string,
  displayTimeMs?: number
) => void;
export type ClipboardMessageSide = "sender" | "receiver";

type MessageSetter = (message: string) => void;
type TimerHandle = ReturnType<typeof setTimeout>;

interface ClipboardMessageControllerOptions {
  setSenderMessage: MessageSetter;
  setReceiverMessage: MessageSetter;
}

export interface AppMessages {
  shareMessage: string;
  retrieveMessage: string;
  showSenderMessage: SideMessageDispatcher;
  showReceiverMessage: SideMessageDispatcher;
  clearSenderMessage: () => void;
  clearReceiverMessage: () => void;
  dispose: () => void;
}

type MessageState = Pick<AppMessages, "shareMessage" | "retrieveMessage">;
type MessageDispatchers = Pick<
  AppMessages,
  "showSenderMessage" | "showReceiverMessage"
>;

const ClipboardAppMessagesContext = createContext<AppMessages | null>(null);

function useClipboardAppMessageState(): AppMessages {
  const [shareMessage, setShareMessage] = useState("");
  const [retrieveMessage, setRetrieveMessage] = useState("");
  const controllerRef = useRef<Omit<AppMessages, "shareMessage" | "retrieveMessage"> | null>(
    null
  );

  if (!controllerRef.current) {
    controllerRef.current = createClipboardMessageController({
      setSenderMessage: setShareMessage,
      setReceiverMessage: setRetrieveMessage,
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;

    return () => {
      controller?.dispose();
    };
  }, []);

  const controller = controllerRef.current;

  return {
    shareMessage,
    retrieveMessage,
    showSenderMessage: controller.showSenderMessage,
    showReceiverMessage: controller.showReceiverMessage,
    clearSenderMessage: controller.clearSenderMessage,
    clearReceiverMessage: controller.clearReceiverMessage,
    dispose: controller.dispose,
  };
}

export function selectClipboardSideMessage(
  messages: MessageState,
  side: ClipboardMessageSide
): string {
  return side === "sender" ? messages.shareMessage : messages.retrieveMessage;
}

export function selectClipboardSideDispatcher(
  dispatchers: MessageDispatchers,
  side: ClipboardMessageSide
): SideMessageDispatcher {
  return side === "sender"
    ? dispatchers.showSenderMessage
    : dispatchers.showReceiverMessage;
}

export function ClipboardAppMessagesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const messages = useClipboardAppMessageState();

  return createElement(
    ClipboardAppMessagesContext.Provider,
    { value: messages },
    children
  );
}

export function createClipboardMessageController({
  setSenderMessage,
  setReceiverMessage,
}: ClipboardMessageControllerOptions): Omit<
  AppMessages,
  "shareMessage" | "retrieveMessage"
> {
  let senderTimer: TimerHandle | null = null;
  let receiverTimer: TimerHandle | null = null;

  const cancelSenderTimer = () => {
    if (senderTimer) {
      clearTimeout(senderTimer);
      senderTimer = null;
    }
  };

  const cancelReceiverTimer = () => {
    if (receiverTimer) {
      clearTimeout(receiverTimer);
      receiverTimer = null;
    }
  };

  const clearSenderMessage = () => {
    cancelSenderTimer();
    setSenderMessage("");
  };

  const clearReceiverMessage = () => {
    cancelReceiverTimer();
    setReceiverMessage("");
  };

  const showSenderMessage: SideMessageDispatcher = (
    message,
    displayTimeMs = 4000
  ) => {
    cancelSenderTimer();
    setSenderMessage(message);
    senderTimer = setTimeout(() => {
      senderTimer = null;
      setSenderMessage("");
    }, displayTimeMs);
  };

  const showReceiverMessage: SideMessageDispatcher = (
    message,
    displayTimeMs = 4000
  ) => {
    cancelReceiverTimer();
    setReceiverMessage(message);
    receiverTimer = setTimeout(() => {
      receiverTimer = null;
      setReceiverMessage("");
    }, displayTimeMs);
  };

  const dispose = () => {
    cancelSenderTimer();
    cancelReceiverTimer();
  };

  return {
    showSenderMessage,
    showReceiverMessage,
    clearSenderMessage,
    clearReceiverMessage,
    dispose,
  };
}

export function useClipboardAppMessages(): AppMessages {
  const context = useContext(ClipboardAppMessagesContext);

  if (!context) {
    throw new Error(
      "useClipboardAppMessages must be used within ClipboardAppMessagesProvider"
    );
  }

  return context;
}

export function useClipboardAppSideMessage(
  side: ClipboardMessageSide
): string {
  const messages = useClipboardAppMessages();

  return selectClipboardSideMessage(messages, side);
}

export function useClipboardAppMessageDispatcher(
  side: ClipboardMessageSide
): SideMessageDispatcher {
  const messages = useClipboardAppMessages();

  return selectClipboardSideDispatcher(messages, side);
}
