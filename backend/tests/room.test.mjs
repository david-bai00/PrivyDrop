import test from "node:test";
import assert from "node:assert/strict";

import { createRoomService } from "../.unit-dist/src/services/roomCore.js";

test("createRoom stores the room hash and aligned socket set expiry", async () => {
  const calls = [];
  const multi = {
    hset(key, field, value) {
      calls.push(["hset", key, field, value]);
      return this;
    },
    expire(key, expiry) {
      calls.push(["expire", key, expiry]);
      return this;
    },
    set(key, value, mode, expiry) {
      calls.push(["set", key, value, mode, expiry]);
      return this;
    },
    sadd(key, member) {
      calls.push(["sadd", key, member]);
      return this;
    },
    del(key) {
      calls.push(["del", key]);
      return this;
    },
    srem(key, member) {
      calls.push(["srem", key, member]);
      return this;
    },
    exec: async () => {
      calls.push(["exec"]);
      return [];
    },
  };

  const service = createRoomService({
    hexists: async () => 0,
    get: async () => null,
    scard: async () => 0,
    del: async () => 0,
    multi: () => multi,
  });

  await service.createRoom("ABCD");

  assert.equal(calls[0][0], "hset");
  assert.equal(calls[0][1], "room:ABCD");
  assert.equal(calls[1][0], "expire");
  assert.deepEqual(calls[1].slice(1), ["room:ABCD", 86400]);
  assert.deepEqual(calls[2].slice(1), ["room:ABCD:sockets", 86400]);
  assert.equal(calls.at(-1)?.[0], "exec");
});

test("bindSocketToRoom and unbindSocketFromRoom use the expected redis keys", async () => {
  const calls = [];
  const multi = {
    hset() {
      return this;
    },
    expire() {
      return this;
    },
    set(key, value, mode, expiry) {
      calls.push(["set", key, value, mode, expiry]);
      return this;
    },
    sadd(key, member) {
      calls.push(["sadd", key, member]);
      return this;
    },
    del(key) {
      calls.push(["del", key]);
      return this;
    },
    srem(key, member) {
      calls.push(["srem", key, member]);
      return this;
    },
    exec: async () => {
      calls.push(["exec"]);
      return [];
    },
  };

  const service = createRoomService({
    hexists: async () => 0,
    get: async () => null,
    scard: async () => 0,
    del: async () => 0,
    multi: () => multi,
  });

  await service.bindSocketToRoom("socket-1", "ABCD");
  await service.unbindSocketFromRoom("socket-1", "ABCD");

  assert.deepEqual(calls[0], ["set", "socket:socket-1", "ABCD", "EX", 90000]);
  assert.deepEqual(calls[1], ["sadd", "room:ABCD:sockets", "socket-1"]);
  assert.deepEqual(calls[3], ["del", "socket:socket-1"]);
  assert.deepEqual(calls[4], ["srem", "room:ABCD:sockets", "socket-1"]);
});

test("refreshRoom and room occupancy helpers use the room socket set key", async () => {
  const calls = [];
  const multi = {
    hset() {
      return this;
    },
    expire(key, expiry) {
      calls.push(["expire", key, expiry]);
      return this;
    },
    set() {
      return this;
    },
    sadd() {
      return this;
    },
    del() {
      return this;
    },
    srem() {
      return this;
    },
    exec: async () => {
      calls.push(["exec"]);
      return [];
    },
  };
  let scardCalls = 0;

  const service = createRoomService({
    hexists: async () => 0,
    get: async () => null,
    scard: async (key) => {
      calls.push(["scard", key]);
      scardCalls += 1;
      return scardCalls === 1 ? 0 : 3;
    },
    del: async () => 0,
    multi: () => multi,
  });

  await service.refreshRoom("ABCD", 900);
  assert.deepEqual(calls[0], ["expire", "room:ABCD", 900]);
  assert.deepEqual(calls[1], ["expire", "room:ABCD:sockets", 900]);
  assert.equal(await service.isRoomEmpty("ABCD"), true);
  assert.equal(await service.roomNumOfConnection("ABCD"), 3);
  assert.deepEqual(calls[3], ["scard", "room:ABCD:sockets"]);
  assert.deepEqual(calls[4], ["scard", "room:ABCD:sockets"]);
});
