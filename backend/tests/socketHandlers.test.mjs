import test from "node:test";
import assert from "node:assert/strict";

import { setupSocketHandlers } from "../.unit-dist/src/socket/handlersCore.js";

class FakeSocket {
  handlers = new Map();
  emitted = [];
  roomBroadcasts = [];
  roomsJoined = [];

  constructor(
    id,
    handshake = {
      headers: {},
      address: "127.0.0.1",
    }
  ) {
    this.id = id;
    this.handshake = handshake;
  }

  on(event, handler) {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event, payload) {
    this.emitted.push({ event, payload });
    return true;
  }

  join(roomId) {
    this.roomsJoined.push(roomId);
  }

  to(roomId) {
    return {
      emit: (event, payload) => {
        this.roomBroadcasts.push({ roomId, event, payload });
        return true;
      },
    };
  }

  async trigger(event, payload) {
    const handler = this.handlers.get(event);
    assert.ok(handler, `Missing handler for ${event}`);
    await handler(payload);
  }
}

class FakeIo {
  connectionHandler = null;

  on(event, handler) {
    if (event === "connection") {
      this.connectionHandler = handler;
    }
    return this;
  }

  connect(socket) {
    assert.ok(this.connectionHandler, "Connection handler not registered");
    this.connectionHandler(socket);
  }
}

function createDependencies(overrides = {}) {
  return {
    getRoomBySocketId: async () => null,
    isRoomExist: async () => true,
    bindSocketToRoom: async () => undefined,
    refreshRoom: async () => undefined,
    unbindSocketFromRoom: async () => undefined,
    isRoomEmpty: async () => false,
    checkRateLimit: async () => ({ allowed: true, remaining: 1, resetAfter: 5 }),
    disableJoinRateLimit: false,
    ...overrides,
  };
}

test("join rejects sockets that are already bound to another room", async () => {
  const io = new FakeIo();
  const socket = new FakeSocket("socket-1");
  setupSocketHandlers(
    io,
    createDependencies({
      getRoomBySocketId: async () => "room-a",
    })
  );
  io.connect(socket);

  await socket.trigger("join", { roomId: "room-b" });

  assert.deepEqual(socket.emitted[0], {
    event: "joinResponse",
    payload: {
      success: false,
      message: "Socket is already bound to another room",
      roomId: "room-b",
    },
  });
});

test("join returns a rate-limit message before room lookup for fresh joins", async () => {
  const io = new FakeIo();
  const socket = new FakeSocket("socket-2", {
    headers: {},
    address: "10.0.0.2",
  });
  let roomExistChecked = false;
  setupSocketHandlers(
    io,
    createDependencies({
      isRoomExist: async () => {
        roomExistChecked = true;
        return true;
      },
      checkRateLimit: async () => ({
        allowed: false,
        remaining: 0,
        resetAfter: 4,
      }),
    })
  );
  io.connect(socket);

  await socket.trigger("join", { roomId: "room-c" });

  assert.equal(roomExistChecked, false);
  assert.deepEqual(socket.emitted[0], {
    event: "joinResponse",
    payload: {
      success: false,
      message: "Rate limit exceeded. Try again in 4s. Attempts left: 0.",
      roomId: "room-c",
    },
  });
});

test("same-room rejoins bypass rate limiting and refresh room ttl", async () => {
  const io = new FakeIo();
  const socket = new FakeSocket("socket-3");
  let rateLimitCalled = false;
  let refreshedRoomId = null;
  setupSocketHandlers(
    io,
    createDependencies({
      getRoomBySocketId: async () => "room-d",
      checkRateLimit: async () => {
        rateLimitCalled = true;
        return { allowed: true, remaining: 1, resetAfter: 5 };
      },
      refreshRoom: async (roomId) => {
        refreshedRoomId = roomId;
      },
    })
  );
  io.connect(socket);

  await socket.trigger("join", { roomId: "room-d" });

  assert.equal(rateLimitCalled, false);
  assert.equal(refreshedRoomId, "room-d");
  assert.deepEqual(socket.emitted[0], {
    event: "joinResponse",
    payload: {
      success: true,
      message: "Successfully joined room",
      roomId: "room-d",
    },
  });
  assert.deepEqual(socket.roomBroadcasts[0], {
    roomId: "room-d",
    event: "ready",
    payload: { peerId: "socket-3" },
  });
});

test("disconnect notifies the room and extends ttl when the room becomes empty", async () => {
  const io = new FakeIo();
  const socket = new FakeSocket("socket-4");
  const refreshed = [];
  const unbound = [];
  setupSocketHandlers(
    io,
    createDependencies({
      getRoomBySocketId: async () => "room-e",
      isRoomEmpty: async () => true,
      unbindSocketFromRoom: async (socketId, roomId) => {
        unbound.push([socketId, roomId]);
      },
      refreshRoom: async (roomId, expiry) => {
        refreshed.push([roomId, expiry]);
      },
    })
  );
  io.connect(socket);

  await socket.trigger("disconnect");

  assert.deepEqual(socket.roomBroadcasts[0], {
    roomId: "room-e",
    event: "peer-disconnected",
    payload: { peerId: "socket-4" },
  });
  assert.deepEqual(unbound, [["socket-4", "room-e"]]);
  assert.deepEqual(refreshed, [["room-e", 900]]);
});
