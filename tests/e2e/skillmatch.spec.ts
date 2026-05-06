import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { signInDemoRecruiter } from "./auth-helpers";
import { pickDashboardResume } from "./dashboard-upload-helpers";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
const resumePath = path.join(fixtureDir, "alex-smith-sde-resume.pdf");
/** Distinct résumé body so MIME smoke test avoids duplicate detection after alex-smith upload. */
const octetStreamPdfPath = path.join(fixtureDir, "morgan-rivera-streaming-mime.pdf");
const shortResumePath = path.join(fixtureDir, "empty-resume.txt");

let hasMemoryIsolation = false;

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

test.beforeAll(async ({ request }) => {
  if (!fs.existsSync(resumePath)) {
    createResumePdf();
  }
  if (!fs.existsSync(octetStreamPdfPath)) {
    createDistinctResumePdfForMimeTest();
  }
  if (!fs.existsSync(shortResumePath)) {
    fs.writeFileSync(shortResumePath, "Too short.");
  }
  hasMemoryIsolation = (await request.post("/api/e2e/reset-memory")).ok();
});

test.beforeEach(async ({ request }) => {
  if (!hasMemoryIsolation) {
    return;
  }
  const response = await request.post("/api/e2e/reset-memory");
  expect(response.ok(), await response.text()).toBeTruthy();
});

test("allows signed-out users to open signup", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/signup");

  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create Talent Match account" })).toBeVisible();
  await expect(page.getByText("Signup is not available in demo memory mode.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
});

test("requires credential sign-in, uploads a PDF resume, and ranks positions", async ({ page }) => {
  const notice = page.locator(".notice");

  await page.context().clearCookies();
  await signInDemoRecruiter(page);

  await pickDashboardResume(page, resumePath);
  await pickDashboardResume(page, resumePath);
  await expect(page.getByText("alex-smith-sde-resume.pdf")).toBeVisible();
  await expect(page.getByText("alex-smith-sde-resume.pdf")).toHaveCount(1);

  await page.getByRole("button", { name: /remove alex-smith-sde-resume\.pdf/i }).click();
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();

  await pickDashboardResume(page, resumePath);
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

test("updates dashboard match context when the target role changes after analysis", async ({ page }) => {
  const notice = page.locator(".notice");
  const scoreRing = page.locator(".overview-panel [aria-label^='Match score']");
  const skillGapChart = page.locator(".skill-gap-chart");
  const targetRole = page.getByRole("combobox", { name: /target role/i });

  await page.context().clearCookies();
  await signInDemoRecruiter(page);

  await pickDashboardResume(page, resumePath);
  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(notice).toHaveText(/Processed 1 resume/);

  await expect(targetRole).toHaveValue("sde-ii");
  await expect(page.getByLabel("Software Development Engineer II skill coverage chart")).toBeVisible();
  await expect(skillGapChart.getByText("system design")).toBeVisible();
  await expect(scoreRing).toHaveAttribute("aria-label", /Match score \d+%/);
  const originalScore = await scoreRing.getAttribute("aria-label");

  await targetRole.selectOption({ label: "Cloud Support Associate" });

  await expect(targetRole).toHaveValue("cloud-support");
  await expect(page.getByText("Job Family: Cloud Operations")).toBeVisible();
  await expect(page.getByLabel("Cloud Support Associate skill coverage chart")).toBeVisible();
  await expect(skillGapChart.getByText("customer support")).toBeVisible();
  await expect(skillGapChart.getByText("system design")).toHaveCount(0);
  await expect(scoreRing).not.toHaveAttribute("aria-label", originalScore ?? "");
});

test("shows duplicate advisory when uploading the same resume twice in sequence", async ({ page }) => {
  test.skip(
    !hasMemoryIsolation,
    "Duplicate upload sequence needs /api/e2e/reset-memory (no DATABASE_URL). Use Playwright webServer from `npm run test:e2e`, not PW_REUSE_SERVER with a Neon-backed dev app."
  );

  const notice = page.locator(".notice");
  const duplicateAdvisory = page.getByTestId("upload-duplicate-advisory");

  await page.context().clearCookies();
  await signInDemoRecruiter(page);

  await pickDashboardResume(page, resumePath);
  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(notice).toHaveText(/Processed 1 resume/);

  await pickDashboardResume(page, resumePath);
  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(notice).toHaveText(/duplicate or cluster/i);
  await expect(duplicateAdvisory).toBeVisible();
  await expect(duplicateAdvisory).toContainText("alex-smith-sde-resume.pdf");
});

test("accepts PDF when the browser reports application/octet-stream", async ({ page }) => {
  const notice = page.locator(".notice");

  await page.context().clearCookies();
  await signInDemoRecruiter(page);

  const buffer = await fs.promises.readFile(octetStreamPdfPath);
  await pickDashboardResume(page, {
    buffer,
    mimeType: "application/octet-stream",
    name: "streaming-resume.pdf"
  });

  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();
  await expect(notice).toHaveText(/Processed 1 resume/);
  await expect(page.getByRole("button", { name: /Morgan Rivera/i }).first()).toBeVisible();
});

test("keeps failed upload state visible after processing", async ({ page }) => {
  const notice = page.locator(".notice");

  await page.context().clearCookies();
  await signInDemoRecruiter(page);
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();

  await pickDashboardResume(page, shortResumePath);
  await page.getByRole("button", { name: /run skillmatch analysis/i }).click();

  await expect(notice).toHaveText("No resumes were processed.");
  await expect(page.getByText(/empty-resume\.txt: Resume text could not be extracted\./)).toBeVisible();
  await expect(page.getByRole("button", { name: /run skillmatch analysis/i })).toBeDisabled();
});
