import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const edgeChannel =
  process.env.PLAYWRIGHT_EDGE_CHANNEL ??
  (process.platform === "win32" ? "msedge" : undefined);

type PlaywrightProject = NonNullable<PlaywrightTestConfig["projects"]>[number];

const defaultProjects: PlaywrightProject[] = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] }
  }
];

const crossBrowserProjects: PlaywrightProject[] = [
  {
    name: "chrome",
    use: { ...devices["Desktop Chrome"], channel: "chrome" }
  },
  {
    name: "edge",
    use: edgeChannel
      ? { ...devices["Desktop Edge"], channel: edgeChannel }
      : { ...devices["Desktop Edge"] }
  },
  {
    name: "webkit",
    use: { ...devices["Desktop Safari"] }
  }
];

function getProjects(): PlaywrightProject[] {
  const requestedProjects = (process.env.PLAYWRIGHT_PROJECTS ?? "")
    .split(",")
    .map((project) => project.trim())
    .filter(Boolean);

  const availableProjects = [...defaultProjects, ...crossBrowserProjects];

  if (requestedProjects.length > 0) {
    return availableProjects.filter((project) => Boolean(project.name && requestedProjects.includes(project.name)));
  }

  if (process.env.PLAYWRIGHT_CROSS_BROWSER === "1") {
    return availableProjects;
  }

  return defaultProjects;
}

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
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: getProjects()
});
