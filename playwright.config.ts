import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 240_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", serviceWorkers: "block" },
  webServer: { command: "npm run start -- --port 3100", url: "http://127.0.0.1:3100/reader", timeout: 60_000 },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
