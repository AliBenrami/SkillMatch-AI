import { expect, type Page } from "@playwright/test";

/**
 * Credential sign-in for E2E: perform login fetch inside the browser so Set-Cookie is applied to the
 * same cookie jar Playwright navigations use (`page.request` can miss that sync in some setups).
 */
export async function signInDemoRecruiter(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Talent Match sign in" })).toBeVisible();
  await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: "recruiter@skillmatch.demo",
        password: "SkillMatchDemo!23"
      })
    });
    if (!response.ok) {
      throw new Error(`Login failed (${response.status}): ${await response.text()}`);
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SkillMatch AI" })).toBeVisible();
}
