import { defineConfig } from "@playwright/test";
import { E2E_SERVER } from "./tests/e2e/helpers/e2eConfig";

export default defineConfig({
  testDir: "./tests/e2e/regression",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  globalSetup: "./tests/e2e/globalSetup.ts",
  globalTeardown: "./tests/e2e/globalTeardown.ts",
  outputDir: "./test-results",
  use: {
    baseURL: E2E_SERVER.frontendUrl,
    channel: "chrome",
    headless: process.env.PLAYWRIGHT_HEADLESS !== "0",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 1200 },
  },
});
