import path from "node:path";
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

/** Deterministic credential users used when Playwright starts `next dev` (avoid host .env Neon users). */
const PLAYWRIGHT_DEMO_USERS = JSON.stringify([
  {
    name: "Priya Recruiter",
    email: "recruiter@skillmatch.demo",
    role: "recruiter",
    password: "SkillMatchDemo!23"
  },
  {
    name: "Yash Admin",
    email: "admin@skillmatch.demo",
    role: "system_admin",
    password: "SkillMatchAdmin!23"
  },
  {
    name: "Lina L&D",
    email: "learning@skillmatch.demo",
    role: "learning_development",
    password: "SkillMatchLearn!23"
  }
]);

const edgeChannel =
  process.env.PLAYWRIGHT_EDGE_CHANNEL ??
  (process.platform === "win32" ? "msedge" : undefined);
const isCI = process.env.CI === "true" || process.env.CI === "1";
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const mockedFontResponsesPath = path.join(process.cwd(), ".github", "workflows", "next-font-mocks.cjs");

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
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: 30_000,
  workers: 1,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: `${npmExecutable} run dev:ci -- --hostname 127.0.0.1 --port 3000`,
    env: {
      DATABASE_URL: "",
      AUTH_USERS_JSON: PLAYWRIGHT_DEMO_USERS,
      E2E_DISABLE_DATABASE: "1",
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedFontResponsesPath,
      NEXT_PUBLIC_SKILLMATCH_E2E_FILE_HOOK: "1"
    },
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !isCI && process.env.PW_REUSE_SERVER === "1",
    timeout: 30_000
  },
  projects: getProjects()
});
