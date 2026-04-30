import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
const resumePath = path.join(fixtureDir, "alex-smith-sde-resume.pdf");

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
  createResumePdf();
});

test("requires SSO, uploads a PDF resume, and ranks positions", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("button", { name: /sign in with amazon/i }).click();
  await expect(page.getByRole("heading", { name: "SkillMatch AI" })).toBeVisible();

  await page.getByLabel("Upload resume files").setInputFiles(resumePath);
  await expect(page.getByText("alex-smith-sde-resume.pdf")).toBeVisible();

  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(page.getByText(/Processed 1 resume/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Alex Smith Software/ })).toBeVisible();
  await expect(page.getByText("Software Development Engineer II").nth(1)).toBeVisible();
  await expect(page.getByText("Recommended Positions")).toBeVisible();
});
