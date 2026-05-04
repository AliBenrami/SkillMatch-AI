import { expect, type Page } from "@playwright/test";

/** Payloads accepted by Playwright `Locator#setInputFiles`. */
type DashboardResumeFilePayload =
  | string
  | {
      name: string;
      mimeType: string;
      buffer: Buffer;
    };

const dashboardResumeInput = (page: Page) => page.locator(".upload-panel input[type=file]");

/**
 * Populate the native file picker then force React to ingest it. Chromium + Playwright reliably set
 * `input.files`, but delegated `onChange` does not always run — the app exposes
 * `__skillmatchE2eSyncQueuedFilesFromInput` when `Dashboard` receives `enableE2eFileHook` from `app/page.tsx`
 * (`NEXT_PUBLIC_SKILLMATCH_E2E_FILE_HOOK=1` or `E2E_DISABLE_DATABASE=1`). Playwright passes both via `webServer.env`.
 */
export async function pickDashboardResumes(page: Page, payloads: DashboardResumeFilePayload[]) {
  const input = dashboardResumeInput(page);
  await expect(input, "resume file input missing from dashboard DOM").toHaveCount(1);
  await input.setInputFiles(payloads as Parameters<(typeof input)["setInputFiles"]>[0]);
  await page.evaluate(() => {
    const hook = (
      window as Window & {
        __skillmatchE2eSyncQueuedFilesFromInput?: () => void;
      }
    ).__skillmatchE2eSyncQueuedFilesFromInput;
    if (typeof hook !== "function") {
      throw new Error(
        "E2E sync hook missing — enable Playwright webServer env (NEXT_PUBLIC_SKILLMATCH_E2E_FILE_HOOK=1 or E2E_DISABLE_DATABASE=1). Avoid PW_REUSE_SERVER against a dev app without those vars."
      );
    }
    hook();
  });
}

export async function pickDashboardResume(page: Page, payload: DashboardResumeFilePayload) {
  await pickDashboardResumes(page, [payload]);
}
