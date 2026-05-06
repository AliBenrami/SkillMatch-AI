import { expect, type Page } from "@playwright/test";

type DemoAccount = "recruiter" | "learning_development" | "system_admin";

const demoCredentials: Record<DemoAccount, { email: string; password: string }> = {
  recruiter: {
    email: "recruiter@skillmatch.demo",
    password: "SkillMatchDemo!23"
  },
  learning_development: {
    email: "learning@skillmatch.demo",
    password: "SkillMatchLearn!23"
  },
  system_admin: {
    email: "admin@skillmatch.demo",
    password: "SkillMatchAdmin!23"
  }
};

/**
 * Credential sign-in for E2E: perform login fetch inside the browser so Set-Cookie is applied to the
 * same cookie jar Playwright navigations use (`page.request` can miss that sync in some setups).
 */
export async function signInDemoUser(page: Page, account: DemoAccount) {
  const credentials = demoCredentials[account];
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Talent Match sign in" })).toBeVisible();
  await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email,
        password
      })
    });
    if (!response.ok) {
      throw new Error(`Login failed (${response.status}): ${await response.text()}`);
    }
  }, credentials);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SkillMatch AI" })).toBeVisible();
}

export async function signInDemoRecruiter(page: Page) {
  await signInDemoUser(page, "recruiter");
}

export async function signInDemoAdmin(page: Page) {
  await signInDemoUser(page, "system_admin");
}

export async function signInDemoLearningDevelopment(page: Page) {
  await signInDemoUser(page, "learning_development");
}
