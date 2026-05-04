import { describe, expect, it } from "vitest";
import { isAllowedResumeUpload } from "./resume-upload-validation";

describe("isAllowedResumeUpload", () => {
  it("accepts PDF with generic binary MIME reported by many Windows browsers", () => {
    expect(isAllowedResumeUpload("Jane-Doe_resume.pdf", "application/octet-stream")).toBe(true);
  });

  it("accepts DOCX with application/octet-stream", () => {
    expect(isAllowedResumeUpload("profile.docx", "application/octet-stream")).toBe(true);
  });

  it("accepts known PDF MIME case-insensitively", () => {
    expect(isAllowedResumeUpload("a.PDF", "Application/PDF")).toBe(true);
  });

  it("allows empty MIME when extension is allowed", () => {
    expect(isAllowedResumeUpload("resume.txt", "")).toBe(true);
  });

  it("rejects non-resume extensions", () => {
    expect(isAllowedResumeUpload("notes.png", "application/octet-stream")).toBe(false);
    expect(isAllowedResumeUpload("file.doc", "application/msword")).toBe(false);
  });

  it("rejects obvious MIME contradictions for allowed extensions", () => {
    expect(isAllowedResumeUpload("fake.pdf", "image/png")).toBe(false);
  });

  it("allows novel MIME when extension matches and MIME is non-media", () => {
    expect(isAllowedResumeUpload("resume.pdf", "application/x-unknown")).toBe(true);
  });
});
