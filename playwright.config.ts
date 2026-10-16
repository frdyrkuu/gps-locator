import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: "list",
  // Requests and token dialogs contain credentials; do not record artifacts.
  use: { baseURL: "http://localhost:3100", browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "", AUTH_TRUST_HOST: "true" },
  },
});
