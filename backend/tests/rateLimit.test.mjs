import test from "node:test";
import assert from "node:assert/strict";

import { createRateLimitService } from "../.unit-dist/src/services/rateLimitCore.js";

test("checkRateLimit allows requests within quota and reports remaining budget", async (t) => {
  const originalNow = Date.now;
  Date.now = () => 1_000_000;

  const pipeline = {
    zadd() {
      return this;
    },
    zremrangebyscore() {
      return this;
    },
    zcard() {
      return this;
    },
    zrange() {
      return this;
    },
    expire() {
      return this;
    },
    exec: async () => [
      [null, 1],
      [null, 0],
      [null, 2],
      [null, ["999000-0.1", "999000"]],
      [null, 1],
    ],
  };

  const service = createRateLimitService({
    pipeline: () => pipeline,
  });

  try {
    const result = await service.checkRateLimit("127.0.0.1");

    assert.deepEqual(result, {
      allowed: true,
      remaining: 0,
      resetAfter: 4,
    });
  } finally {
    Date.now = originalNow;
  }
});

test("checkRateLimit rejects requests once quota is exceeded", async (t) => {
  const originalNow = Date.now;
  Date.now = () => 2_000_000;

  const service = createRateLimitService({
    pipeline: () => ({
      zadd() {
        return this;
      },
      zremrangebyscore() {
        return this;
      },
      zcard() {
        return this;
      },
      zrange() {
        return this;
      },
      expire() {
        return this;
      },
      exec: async () => [
        [null, 1],
        [null, 0],
        [null, 3],
        [null, ["1999000-0.2", "1999000"]],
        [null, 1],
      ],
    }),
  });

  try {
    const result = await service.checkRateLimit("10.0.0.4");

    assert.deepEqual(result, {
      allowed: false,
      remaining: 0,
      resetAfter: 4,
    });
  } finally {
    Date.now = originalNow;
  }
});

test("checkRateLimit fails closed when the redis pipeline returns null", async () => {
  const service = createRateLimitService({
    pipeline: () => ({
      zadd() {
        return this;
      },
      zremrangebyscore() {
        return this;
      },
      zcard() {
        return this;
      },
      zrange() {
        return this;
      },
      expire() {
        return this;
      },
      exec: async () => null,
    }),
  });

  const result = await service.checkRateLimit("10.0.0.5");

  assert.deepEqual(result, {
    allowed: false,
    remaining: 0,
    resetAfter: 5,
  });
});
