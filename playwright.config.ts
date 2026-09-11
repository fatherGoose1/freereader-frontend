import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 240_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, serviceWorkers: "block", headless: process.env.TTS_HEADED !== "1" },
  webServer: { command: `npm run start -- --port ${port}`, url: `http://127.0.0.1:${port}/reader`, timeout: 60_000 },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
