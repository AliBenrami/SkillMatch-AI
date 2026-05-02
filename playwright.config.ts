import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

type Project = NonNullable<PlaywrightTestConfig["projects"]>[number];

const defaultProjects: Project[] = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] }
  }
];

const crossBrowserProjects: Project[] = [
  {
    name: "chrome",
    use: { ...devices["Desktop Chrome"], channel: "chrome" }
  },
  {
    name: "edge",
    use: { ...devices["Desktop Edge"], channel: "msedge" }
  },
  {
    name: "webkit",
    use: { ...devices["Desktop Safari"] }
  }
];

function getProjects(): Project[] {
  const requestedProjects = (process.env.PLAYWRIGHT_PROJECTS ?? "")
    .split(",")
    .map((project) => project.trim())
    .filter(Boolean);

  const availableProjects = [...defaultProjects, ...crossBrowserProjects];

  if (requestedProjects.length > 0) {
    return availableProjects.filter((project) => requestedProjects.includes(project.name));
  }

  if (process.env.PLAYWRIGHT_CROSS_BROWSER === "1") {
    return availableProjects;
  }

  return defaultProjects;
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
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
