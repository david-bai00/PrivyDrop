import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import Redis from "ioredis";
import { io as createSocketClient } from "socket.io-client";

const backendDir = new URL("../../", import.meta.url);
const redisHost = process.env.BACKEND_TEST_REDIS_HOST ?? "127.0.0.1";
const redisPort = Number(process.env.BACKEND_TEST_REDIS_PORT ?? "6379");
const backendPort = Number(process.env.BACKEND_TEST_PORT ?? "3311");
const baseUrl = `http://127.0.0.1:${backendPort}`;
const socketUrl = `ws://127.0.0.1:${backendPort}`;

let serverProcess;
let redis;
const activeSockets = new Set();

function randomRoomId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 12)}`;
}

async function waitForServer() {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error("Timed out waiting for backend health check");
}

function startServer() {
  serverProcess = spawn("node", ["dist/server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: "development",
      BACKEND_PORT: String(backendPort),
      REDIS_HOST: redisHost,
      REDIS_PORT: String(redisPort),
      CORS_ORIGIN: "http://127.0.0.1:3000",
      DISABLE_JOIN_RATE_LIMIT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", () => {});
  serverProcess.stderr.on("data", () => {});
}

async function stopServer() {
  if (!serverProcess) {
    return;
  }

  const exited = new Promise((resolve) => {
    serverProcess.once("exit", resolve);
  });
  serverProcess.kill("SIGTERM");
  await Promise.race([exited, sleep(5_000)]);
  serverProcess = undefined;
}

async function createRoom(roomId) {
  const response = await postJson("/api/create_room", { roomId });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
}

async function postJson(path, body) {
  return await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function waitForSocketEvent(socket, eventName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 5_000);

    function onEvent(payload) {
      clearTimeout(timer);
      resolve(payload);
    }

    socket.once(eventName, onEvent);
  });
}

async function connectClient(forwardedFor) {
  const socket = createSocketClient(socketUrl, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: {
      "x-forwarded-for": forwardedFor,
    },
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for socket connect"));
    }, 5_000);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  activeSockets.add(socket);
  return socket;
}

async function joinRoom(socket, roomId) {
  const responsePromise = waitForSocketEvent(socket, "joinResponse");
  socket.emit("join", { roomId });
  return await responsePromise;
}

async function waitForTtlAtMost(key, maxSeconds) {
  const timeoutAt = Date.now() + 5_000;
  while (Date.now() < timeoutAt) {
    const ttl = await redis.ttl(key);
    if (ttl > 0 && ttl <= maxSeconds) {
      return ttl;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for TTL <= ${maxSeconds} on ${key}`);
}

test.before(async () => {
  redis = new Redis({
    host: redisHost,
    port: redisPort,
  });
  startServer();
  await waitForServer();
});

test.after(async () => {
  for (const socket of activeSockets) {
    socket.disconnect();
  }
  activeSockets.clear();
  await redis.quit();
  await stopServer();
});

test.beforeEach(async () => {
  await redis.flushdb();
});

test.afterEach(async () => {
  for (const socket of activeSockets) {
    socket.disconnect();
  }
  activeSockets.clear();
  await redis.flushdb();
});

test("join, same-room rejoin, ready broadcast, and cross-room rebinding rules work end-to-end", async () => {
  const roomA = randomRoomId("room-a");
  const roomB = randomRoomId("room-b");
  await createRoom(roomA);
  await createRoom(roomB);

  const first = await connectClient("10.0.0.10");
  const second = await connectClient("10.0.0.11");

  const firstJoin = await joinRoom(first, roomA);
  assert.deepEqual(firstJoin, {
    success: true,
    message: "Successfully joined room",
    roomId: roomA,
  });

  const sameRoomRejoin = await joinRoom(first, roomA);
  assert.deepEqual(sameRoomRejoin, {
    success: true,
    message: "Successfully joined room",
    roomId: roomA,
  });

  const readyPromise = waitForSocketEvent(first, "ready");
  const secondJoin = await joinRoom(second, roomA);
  assert.deepEqual(secondJoin, {
    success: true,
    message: "Successfully joined room",
    roomId: roomA,
  });
  assert.deepEqual(await readyPromise, { peerId: second.id });

  const crossRoomRebind = await joinRoom(first, roomB);
  assert.deepEqual(crossRoomRebind, {
    success: false,
    message: "Socket is already bound to another room",
    roomId: roomB,
  });
});

test("join rate limit rejects the third fresh join but bypasses same-room rejoins", async () => {
  const roomA = randomRoomId("rate-room-a");
  const roomB = randomRoomId("rate-room-b");
  await createRoom(roomA);
  await createRoom(roomB);

  const first = await connectClient("10.0.0.20");
  const second = await connectClient("10.0.0.20");
  const third = await connectClient("10.0.0.20");

  assert.equal((await joinRoom(first, roomA)).success, true);
  assert.equal((await joinRoom(second, roomB)).success, true);

  const blocked = await joinRoom(third, roomA);
  assert.equal(blocked.success, false);
  assert.match(blocked.message, /Rate limit exceeded/);

  const bypassedRejoin = await joinRoom(first, roomA);
  assert.deepEqual(bypassedRejoin, {
    success: true,
    message: "Successfully joined room",
    roomId: roomA,
  });
});

test("disconnect emits peer-disconnected and refreshes an empty room TTL", async () => {
  const roomId = randomRoomId("disconnect-room");
  await createRoom(roomId);

  const first = await connectClient("10.0.0.30");
  const second = await connectClient("10.0.0.31");

  await joinRoom(first, roomId);
  await joinRoom(second, roomId);

  const disconnectedPromise = waitForSocketEvent(second, "peer-disconnected");
  const firstPeerId = first.id;
  first.disconnect();
  activeSockets.delete(first);

  assert.deepEqual(await disconnectedPromise, { peerId: firstPeerId });

  second.disconnect();
  activeSockets.delete(second);

  const roomTtl = await waitForTtlAtMost(`room:${roomId}`, 900);
  const socketsTtl = await redis.ttl(`room:${roomId}:sockets`);

  assert.ok(roomTtl > 0);
  assert.equal(socketsTtl, -2);
});

test("create_room and check_room enforce short-id uniqueness but allow long-id re-create", async () => {
  const shortRoomId = "1234";
  const longRoomId = randomRoomId("long-room");

  const availableBeforeCreate = await postJson("/api/check_room", {
    roomId: shortRoomId,
  });
  assert.equal(availableBeforeCreate.status, 200);
  assert.deepEqual(await availableBeforeCreate.json(), { available: true });

  const createShort = await postJson("/api/create_room", { roomId: shortRoomId });
  assert.equal(createShort.status, 200);
  assert.deepEqual(await createShort.json(), {
    success: true,
    message: "create room success",
  });

  const duplicateShort = await postJson("/api/create_room", { roomId: shortRoomId });
  assert.equal(duplicateShort.status, 200);
  assert.deepEqual(await duplicateShort.json(), {
    success: false,
    message: "roomId is already exists",
  });

  const unavailableAfterCreate = await postJson("/api/check_room", {
    roomId: shortRoomId,
  });
  assert.equal(unavailableAfterCreate.status, 200);
  assert.deepEqual(await unavailableAfterCreate.json(), { available: false });

  const createLong = await postJson("/api/create_room", { roomId: longRoomId });
  assert.equal(createLong.status, 200);
  assert.deepEqual(await createLong.json(), {
    success: true,
    message: "create room success",
  });

  const recreateLong = await postJson("/api/create_room", { roomId: longRoomId });
  assert.equal(recreateLong.status, 200);
  assert.deepEqual(await recreateLong.json(), {
    success: true,
    message: "room exists (rejoin allowed)",
  });
});

test("leave_room notifies peers, unbinds sockets, and refreshes the room ttl when empty", async () => {
  const roomId = randomRoomId("leave-room");
  await createRoom(roomId);

  const first = await connectClient("10.0.0.40");
  const second = await connectClient("10.0.0.41");

  await joinRoom(first, roomId);
  await joinRoom(second, roomId);

  const firstPeerId = first.id;
  const peerLeftPromise = waitForSocketEvent(second, "peer-disconnected");
  const firstLeave = await postJson("/api/leave_room", {
    roomId,
    socketId: firstPeerId,
  });

  assert.equal(firstLeave.status, 200);
  assert.deepEqual(await firstLeave.json(), {
    success: true,
    message: "Successfully left the room",
  });
  assert.deepEqual(await peerLeftPromise, { peerId: firstPeerId });
  assert.equal(await redis.get(`socket:${firstPeerId}`), null);
  assert.equal(await redis.scard(`room:${roomId}:sockets`), 1);

  const secondLeave = await postJson("/api/leave_room", {
    roomId,
    socketId: second.id,
  });
  assert.equal(secondLeave.status, 200);
  assert.deepEqual(await secondLeave.json(), {
    success: true,
    message: "Successfully left the room",
  });

  const roomTtl = await waitForTtlAtMost(`room:${roomId}`, 900);
  const socketsTtl = await redis.ttl(`room:${roomId}:sockets`);

  assert.ok(roomTtl > 0);
  assert.equal(socketsTtl, -2);
});
