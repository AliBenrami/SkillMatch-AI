import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
const resumePath = path.join(fixtureDir, "alex-smith-sde-resume.pdf");
/** Distinct résumé body so MIME smoke test avoids duplicate detection after alex-smith upload. */
const octetStreamPdfPath = path.join(fixtureDir, "morgan-rivera-streaming-mime.pdf");
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

function createDistinctResumePdfForMimeTest() {
  fs.mkdirSync(fixtureDir, { recursive: true });
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(octetStreamPdfPath));
  doc.text("Morgan Rivera");
  doc.text("Backend engineer specializing in Rust and Go.");
  doc.text("Skills: Rust, Go, PostgreSQL, gRPC, Kubernetes, Prometheus, Kafka.");
  doc.text("Certification: Certified Kubernetes Administrator.");
  doc.end();
}

test.beforeAll(() => {
  if (!fs.existsSync(resumePath)) {
    createResumePdf();
  }
  if (!fs.existsSync(octetStreamPdfPath)) {
    createDistinctResumePdfForMimeTest();
  }
  if (!fs.existsSync(shortResumePath)) {
    fs.writeFileSync(shortResumePath, "Too short.");
  }
});

test("allows signed-out users to open signup", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/signup");

  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create Talent Match account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("requires credential sign-in, uploads a PDF resume, and ranks positions", async ({ page }) => {
  const uploadInput = page.getByLabel("Upload resume files");
  const notice = page.locator(".notice");

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
  await expect(notice).toHaveText(/Processed 1 resume/);
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Alex Smith Software/ }).first()).toBeVisible();
  await expect(page.getByText("Software Development Engineer II").nth(1)).toBeVisible();
  await expect(page.getByText("Recommended Positions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Role Skill-Gap Chart" })).toBeVisible();
  await expect(page.locator(".skill-gap-chart").getByText("system design")).toBeVisible();
});

test("accepts PDF when the browser reports application/octet-stream", async ({ page }) => {
  const uploadInput = page.getByLabel("Upload resume files");
  const notice = page.locator(".notice");

  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill("recruiter@skillmatch.demo");
  await page.getByLabel("Password").fill("SkillMatchDemo!23");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "SkillMatch AI" })).toBeVisible();

  const buffer = await fs.promises.readFile(octetStreamPdfPath);
  await uploadInput.setInputFiles({
    buffer,
    mimeType: "application/octet-stream",
    name: "streaming-resume.pdf"
  });

  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(notice).toHaveText(/Processed 1 resume/);
  await expect(page.getByRole("button", { name: /Morgan Rivera/i }).first()).toBeVisible();
});

test("keeps failed upload state visible after processing", async ({ page }) => {
  const uploadInput = page.getByLabel("Upload resume files");
  const notice = page.locator(".notice");

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

  await expect(notice).toHaveText("No resumes were processed.");
  await expect(page.getByText(/empty-resume\.txt: Resume text could not be extracted\./)).toBeVisible();
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();
});
