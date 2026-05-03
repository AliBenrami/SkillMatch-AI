import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const shotDir = path.join(process.cwd(), "ui-review-screenshots");
const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
const resumePath = path.join(fixtureDir, "alex-smith-sde-resume.pdf");

function ensureResumePdf() {
  fs.mkdirSync(fixtureDir, { recursive: true });
  if (fs.existsSync(resumePath)) {
    return;
  }
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(resumePath));
  doc.text("Alex Smith");
  doc.text("Java engineer with 5 years experience.");
  doc.text("Skills: Java, AWS, SQL, REST API, Git, System Design, Data Structures, Docker.");
  doc.text("Certification: AWS Certified Cloud Practitioner.");
  doc.end();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  ensureResumePdf();
  fs.mkdirSync(shotDir, { recursive: true });
});

test("captures auth and dashboard screens for visual review", async ({ page, browserName }) => {
  const tag = browserName.toLowerCase().replace(/\s+/g, "-");

  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Secure sign in" })).toBeVisible();
  await page.screenshot({
    path: path.join(shotDir, `01-login-${tag}.png`),
    fullPage: true
  });

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.screenshot({
    path: path.join(shotDir, `02-signup-${tag}.png`),
    fullPage: true
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("recruiter@skillmatch.demo");
  await page.getByLabel("Password").fill("SkillMatchDemo!23");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "SkillMatch AI" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
  await page.screenshot({
    path: path.join(shotDir, `03-dashboard-empty-${tag}.png`),
    fullPage: true
  });

  const uploadInput = page.locator('input[type="file"]').first();
  await uploadInput.setInputFiles(resumePath);
  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(page.getByText(/Processed 1 resume/)).toBeVisible();
  await page.screenshot({
    path: path.join(shotDir, `04-dashboard-after-analysis-${tag}.png`),
    fullPage: true
  });

  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Analyses" }).click();
  await page.screenshot({
    path: path.join(shotDir, `05-analyses-${tag}.png`),
    fullPage: true
  });

  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Learning" }).click();
  await page.screenshot({
    path: path.join(shotDir, `06-learning-${tag}.png`),
    fullPage: true
  });

  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Workforce" }).click();
  await page.screenshot({
    path: path.join(shotDir, `07-workforce-${tag}.png`),
    fullPage: true
  });

  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Audit Log" }).click();
  await page.screenshot({
    path: path.join(shotDir, `08-audit-${tag}.png`),
    fullPage: true
  });

  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Settings" }).click();
  await page.screenshot({
    path: path.join(shotDir, `09-settings-${tag}.png`),
    fullPage: true
  });

  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Dashboard" }).click();
  await page.screenshot({
    path: path.join(shotDir, `10-dashboard-return-${tag}.png`),
    fullPage: true
  });
});
