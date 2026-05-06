import { expect, test } from "@playwright/test";
import { signInDemoAdmin, signInDemoLearningDevelopment } from "./auth-helpers";

let hasMemoryIsolation = false;

test.beforeAll(async ({ request }) => {
  hasMemoryIsolation = (await request.post("/api/e2e/reset-memory")).ok();
});

test.beforeEach(async ({ request }) => {
  if (!hasMemoryIsolation) {
    return;
  }
  await request.post("/api/e2e/reset-memory");
});

test("learning development sees the L&D skill-gap report", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoLearningDevelopment(page);

  await page.locator('nav[aria-label="Sections"]').getByRole("button", { name: "Learning" }).click();
  await expect(page.getByTestId("learning-report-panel")).toBeVisible();
  await expect(page.getByRole("heading", { name: /L&D skill-gap report/i })).toBeVisible();
});

test("learning development sees the Workforce skill-gap report", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoLearningDevelopment(page);

  await page.locator('nav[aria-label="Sections"]').getByRole("button", { name: "Workforce" }).click();
  await expect(page.getByTestId("workforce-report-panel").or(page.getByText("No Workforce report data yet"))).toBeVisible();
  await expect(page.getByText(/Workforce \/ L&D report based on saved candidate analyses/i)).toBeVisible();
});

test("system admin sees the operational alerts panel and audit filters", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoAdmin(page);

  await page.locator('nav[aria-label="Sections"]').getByRole("button", { name: "Audit Log" }).click();
  await expect(page.getByTestId("admin-alerts-panel")).toBeVisible();
  await expect(page.getByTestId("audit-filter-toolbar")).toBeVisible();
  await expect(page.getByTestId("audit-integrity-banner")).toBeVisible();

  // Seed a placeholder alert and confirm it appears.
  await page.getByRole("button", { name: /add demo sync placeholder/i }).click();
  await expect(page.getByTestId("admin-alerts-panel").getByText(/future sync integration placeholder/i)).toBeVisible();
});

test("system admin can filter the audit log by action", async ({ page }) => {
  await page.context().clearCookies();
  await signInDemoAdmin(page);

  await page.locator('nav[aria-label="Sections"]').getByRole("button", { name: "Audit Log" }).click();
  await expect(page.getByTestId("audit-filter-toolbar")).toBeVisible();

  await page.getByTestId("audit-filter-toolbar").getByLabel("Action").fill("login");
  await page.getByRole("button", { name: /apply filters/i }).click();

  // The audit log should still load without error after applying filters.
  await expect(page.getByTestId("audit-integrity-banner")).toBeVisible();
});
