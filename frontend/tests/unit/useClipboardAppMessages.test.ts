import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClipboardMessageController } from "@/hooks/useClipboardAppMessages";

describe("createClipboardMessageController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the newer sender message alive when an older timer expires", () => {
    let senderMessage = "";
    let receiverMessage = "";
    const controller = createClipboardMessageController({
      setSenderMessage: (message) => {
        senderMessage = message;
      },
      setReceiverMessage: (message) => {
        receiverMessage = message;
      },
    });

    controller.showSenderMessage("first", 4000);
    vi.advanceTimersByTime(1000);
    controller.showSenderMessage("second", 4000);

    vi.advanceTimersByTime(2999);
    expect(senderMessage).toBe("second");
    expect(receiverMessage).toBe("");

    vi.advanceTimersByTime(1000);
    expect(senderMessage).toBe("second");

    vi.advanceTimersByTime(1);
    expect(senderMessage).toBe("");
  });

  it("keeps sender and receiver timers isolated", () => {
    let senderMessage = "";
    let receiverMessage = "";
    const controller = createClipboardMessageController({
      setSenderMessage: (message) => {
        senderMessage = message;
      },
      setReceiverMessage: (message) => {
        receiverMessage = message;
      },
    });

    controller.showSenderMessage("sender", 4000);
    controller.showReceiverMessage("receiver", 2000);

    vi.advanceTimersByTime(2000);
    expect(senderMessage).toBe("sender");
    expect(receiverMessage).toBe("");

    vi.advanceTimersByTime(2000);
    expect(senderMessage).toBe("");
  });

  it("cancels timers when a side is cleared or disposed", () => {
    let senderMessage = "";
    let receiverMessage = "";
    const controller = createClipboardMessageController({
      setSenderMessage: (message) => {
        senderMessage = message;
      },
      setReceiverMessage: (message) => {
        receiverMessage = message;
      },
    });

    controller.showSenderMessage("sender", 4000);
    controller.showReceiverMessage("receiver", 4000);

    controller.clearSenderMessage();
    expect(senderMessage).toBe("");
    expect(receiverMessage).toBe("receiver");

    controller.dispose();
    vi.advanceTimersByTime(4000);

    expect(senderMessage).toBe("");
    expect(receiverMessage).toBe("receiver");
  });
});
