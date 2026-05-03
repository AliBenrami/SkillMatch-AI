import { defineConfig, devices } from "@playwright/test";

const edgeChannel =
  process.env.PLAYWRIGHT_EDGE_CHANNEL ??
  (process.platform === "win32" ? "msedge" : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    env: {
      DATABASE_URL: ""
    },
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
    timeout: 30_000
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "safari",
      use: { ...devices["Desktop Safari"] }
    },
    {
      name: "edge",
      use: edgeChannel
        ? { ...devices["Desktop Edge"], channel: edgeChannel }
        : { ...devices["Desktop Edge"] }
    }
  ]
});
