import { describe, expect, it } from "vitest";

import {
  buildSenderShareLink,
  getReceiverRoomStatusText,
  getSenderRoomStatusText,
} from "@/lib/app/roomPresentation";

describe("roomPresentation", () => {
  it("derives sender status text from sender room facts", () => {
    expect(
      getSenderRoomStatusText({
        isInRoom: false,
        peerCount: 0,
        roomEmptyLabel: "room-empty",
        onlyOneLabel: "only-one",
        peopleCountLabel: (peerCount) => `${peerCount} people`,
      })
    ).toBe("room-empty");

    expect(
      getSenderRoomStatusText({
        isInRoom: true,
        peerCount: 0,
        roomEmptyLabel: "room-empty",
        onlyOneLabel: "only-one",
        peopleCountLabel: (peerCount) => `${peerCount} people`,
      })
    ).toBe("only-one");

    expect(
      getSenderRoomStatusText({
        isInRoom: true,
        peerCount: 2,
        roomEmptyLabel: "room-empty",
        onlyOneLabel: "only-one",
        peopleCountLabel: (peerCount) => `${peerCount} people`,
      })
    ).toBe("3 people");
  });

  it("derives receiver status text from receiver room facts", () => {
    expect(
      getReceiverRoomStatusText({
        isInRoom: false,
        peerCount: 0,
        senderDisconnected: false,
        receiverCanAcceptLabel: "can-accept",
        onlyOneLabel: "only-one",
        connectedLabel: "connected",
        senderDisconnectedLabel: "sender-disconnected",
      })
    ).toBe("can-accept");

    expect(
      getReceiverRoomStatusText({
        isInRoom: true,
        peerCount: 0,
        senderDisconnected: false,
        receiverCanAcceptLabel: "can-accept",
        onlyOneLabel: "only-one",
        connectedLabel: "connected",
        senderDisconnectedLabel: "sender-disconnected",
      })
    ).toBe("only-one");

    expect(
      getReceiverRoomStatusText({
        isInRoom: true,
        peerCount: 1,
        senderDisconnected: false,
        receiverCanAcceptLabel: "can-accept",
        onlyOneLabel: "only-one",
        connectedLabel: "connected",
        senderDisconnectedLabel: "sender-disconnected",
      })
    ).toBe("connected");

    expect(
      getReceiverRoomStatusText({
        isInRoom: true,
        peerCount: 1,
        senderDisconnected: true,
        receiverCanAcceptLabel: "can-accept",
        onlyOneLabel: "only-one",
        connectedLabel: "connected",
        senderDisconnectedLabel: "sender-disconnected",
      })
    ).toBe("sender-disconnected");
  });

  it("builds sender share links only for an active sender room session", () => {
    expect(
      buildSenderShareLink({
        roomId: "",
        isInRoom: true,
        origin: "https://example.test",
        pathname: "/share",
      })
    ).toBe("");

    expect(
      buildSenderShareLink({
        roomId: "room-a",
        isInRoom: false,
        origin: "https://example.test",
        pathname: "/share",
      })
    ).toBe("");

    expect(
      buildSenderShareLink({
        roomId: "room-a",
        isInRoom: true,
        origin: "https://example.test",
        pathname: "/share",
      })
    ).toBe("https://example.test/share?roomId=room-a");
  });
});
