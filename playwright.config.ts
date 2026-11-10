import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  // Cold Next compilation on the Windows workspace can exceed the default deadlines.
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    locale: "pt-BR",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: false,
    timeout: process.env.INVICTUS_E2E_PRODUCTION === '1' ? 300000 : 120000,
  },
});
