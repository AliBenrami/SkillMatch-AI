import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
const resumePath = path.join(fixtureDir, "alex-smith-sde-resume.pdf");
const shortResumePath = path.join(fixtureDir, "empty-resume.txt");

function createResumePdf() {
  fs.mkdirSync(fixtureDir, { recursive: true });
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(resumePath));
  doc.text("Alex Smith");
  doc.text("Java engineer with 5 years experience.");
  doc.text("Skills: Java, AWS, SQL, REST API, Git, System Design, Data Structures, Docker.");
  doc.text("Certification: AWS Certified Cloud Practitioner.");
  doc.end();
}

test.beforeAll(() => {
  if (!fs.existsSync(resumePath)) {
    createResumePdf();
  }
  if (!fs.existsSync(shortResumePath)) {
    fs.writeFileSync(shortResumePath, "Too short.");
  }
});

test("allows signed-out users to open signup", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/signup");

  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("requires SSO, uploads a PDF resume, and ranks positions", async ({ page }) => {
  const uploadInput = page.locator('input[type="file"]').first();

  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill("recruiter@skillmatch.demo");
  await page.getByLabel("Password").fill("SkillMatchDemo!23");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "SkillMatch AI" })).toBeVisible();

  await uploadInput.setInputFiles(resumePath);
  await uploadInput.setInputFiles(resumePath);
  await expect(page.getByText("alex-smith-sde-resume.pdf")).toBeVisible();
  await expect(page.getByText("alex-smith-sde-resume.pdf")).toHaveCount(1);

  await page.getByRole("button", { name: /remove alex-smith-sde-resume\.pdf/i }).click();
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();

  await uploadInput.setInputFiles(resumePath);
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeEnabled();

  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(page.getByText(/Processed 1 resume/)).toBeVisible();
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Alex Smith Software/ }).first()).toBeVisible();
  await expect(page.getByText("Software Development Engineer II").nth(1)).toBeVisible();
  await expect(page.getByText("Recommended Positions")).toBeVisible();
});

test("keeps failed upload state visible after processing", async ({ page }) => {
  const uploadInput = page.locator('input[type="file"]').first();

  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill("recruiter@skillmatch.demo");
  await page.getByLabel("Password").fill("SkillMatchDemo!23");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "SkillMatch AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();

  await uploadInput.setInputFiles(shortResumePath);
  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();

  await expect(page.getByText("No resumes were processed.")).toBeVisible();
  await expect(page.getByText(/empty-resume\.txt: Resume text could not be extracted\./)).toBeVisible();
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();
});
