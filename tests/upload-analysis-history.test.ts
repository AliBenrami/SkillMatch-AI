import { beforeEach, describe, expect, it } from "vitest";
import { analyzeResume } from "@/lib/skillmatch";
import { listAnalyses, resetAnalysesForTests, saveAnalysis } from "@/lib/db";

describe("analysis history alignment with uploads", () => {
  beforeEach(() => {
    resetAnalysesForTests();
  });

  it("records an analysis row when saveAnalysis skips upload-scoped audit noise", async () => {
    const resumeText = `${"x".repeat(25)} Java engineer with AWS, SQL, Docker, and distributed systems experience.`;
    const result = analyzeResume(resumeText, "sde-i");

    await saveAnalysis({
      employeeName: "Taylor Uploaded",
      resumeText,
      result,
      recordAudit: false
    });

    const history = await listAnalyses();
    expect(history.some((row) => row.employeeName === "Taylor Uploaded")).toBe(true);
  });
});
