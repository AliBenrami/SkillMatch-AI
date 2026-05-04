import { expect, test, type Page } from "@playwright/test";
import {
  signInDemoAdmin,
  signInDemoLearningDevelopment,
  signInDemoRecruiter
} from "./auth-helpers";

function sections(page: Page) {
  return page.getByRole("navigation", { name: "Sections" });
}

function navButtonInDom(page: Page, name: string) {
  return page.locator('nav[aria-label="Sections"] button').filter({ hasText: name });
}

async function expectNavButtonVisible(page: Page, name: string) {
  await expect(sections(page).getByRole("button", { name })).toBeVisible();
  await expect(navButtonInDom(page, name)).toHaveCount(1);
}

async function expectNavButtonAbsentFromDom(page: Page, name: string) {
  await expect(navButtonInDom(page, name)).toHaveCount(0);
}

test("recruiter navigation hides admin-only audit and learning sections", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoRecruiter(page);

  await expectNavButtonVisible(page, "Dashboard");
  await expectNavButtonVisible(page, "Analyses");
  await expectNavButtonVisible(page, "Workforce");
  await expectNavButtonVisible(page, "Settings");
  await expectNavButtonAbsentFromDom(page, "Learning");
  await expectNavButtonAbsentFromDom(page, "Audit Log");
  await expect(sections(page).locator("button:disabled")).toHaveCount(0);
});

test("learning development navigation shows learning sections without admin audit controls", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoLearningDevelopment(page);

  await expectNavButtonVisible(page, "Dashboard");
  await expectNavButtonVisible(page, "Analyses");
  await expectNavButtonVisible(page, "Learning");
  await expectNavButtonVisible(page, "Settings");
  await expectNavButtonAbsentFromDom(page, "Workforce");
  await expectNavButtonAbsentFromDom(page, "Audit Log");
  await expect(sections(page).locator("button:disabled")).toHaveCount(0);
});

test("system admin navigation includes audit controls", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoAdmin(page);

  for (const name of ["Dashboard", "Analyses", "Learning", "Workforce", "Audit Log", "Settings"]) {
    await expectNavButtonVisible(page, name);
  }
});

test("restricted deep links show a restricted state without rendering hidden nav buttons", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoRecruiter(page);
  await page.goto("/?view=audit");

  await expect(page.getByRole("heading", { name: "Restricted access: Audit Log" })).toBeVisible();
  await expect(page.getByText("Current role: recruiter")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Audit Log$/ })).toHaveCount(0);
  await expectNavButtonAbsentFromDom(page, "Audit Log");
});
