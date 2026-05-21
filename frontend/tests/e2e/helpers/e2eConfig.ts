import path from "node:path";

const E2E_SERVER_BASE = {
  host: "127.0.0.1",
  backendPort: 34101,
  frontendPort: 34102,
  redisPort: 36379,
  localePath: "/en",
} as const;

export const E2E_TIMEOUT: Record<"short" | "medium" | "long", number> = {
  short: 10_000,
  medium: 30_000,
  long: 60_000,
};

export const E2E_SERVER_URLS = {
  backendUrl: `http://${E2E_SERVER_BASE.host}:${E2E_SERVER_BASE.backendPort}`,
  frontendUrl: `http://${E2E_SERVER_BASE.host}:${E2E_SERVER_BASE.frontendPort}`,
} as const;

export const E2E_SERVER = {
  ...E2E_SERVER_BASE,
  ...E2E_SERVER_URLS,
};

export const REDIS_STATE_PATH = path.resolve(
  process.cwd(),
  ".playwright",
  "process-state.json"
);
