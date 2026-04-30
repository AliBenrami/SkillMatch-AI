import { describe, expect, it } from "vitest";
import {
  analyzeCandidateResume,
  analyzeResume,
  extractSkills,
  maskDemographicSignals,
  normalizeResumeText,
  rankResumeForPositions
} from "@/lib/skillmatch";

describe("skill matching engine", () => {
  it("normalizes resume text for lexical analysis", () => {
    expect(normalizeResumeText("React, TypeScript,\nSQL!")).toBe("react typescript sql");
  });

  it("extracts known skills from resume text", () => {
    expect(extractSkills("I build React apps with TypeScript, SQL, Git, and AWS.")).toEqual(
      expect.arrayContaining(["typescript", "react", "aws", "sql", "git"])
    );
  });

  it("weights required skills more than preferred skills", () => {
    const result = analyzeResume("TypeScript React JavaScript Node SQL Git testing", "sde-i");

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.matchedSkills).toContain("typescript");
    expect(result.missingSkills.map((item) => item.skill)).toContain("aws");
    expect(result.explanation).toContain("required skills count twice");
  });

  it("ranks good positions for each resume", () => {
    const recommendations = rankResumeForPositions(
      "Java engineer with AWS, SQL, REST API, Git, system design, Docker, and data structures experience."
    );

    expect(recommendations[0].role.id).toBe("sde-ii");
    expect(recommendations[0].score).toBeGreaterThan(70);
  });

  it("extracts structured resume data and masks demographic signals", () => {
    const analysis = analyzeCandidateResume({
      fileName: "alex-smith-resume.txt",
      storageUrl: "local://resume",
      resumeText:
        "Alex Smith\nalex@example.com\n555-123-4567\nBachelor Computer Science\nAWS Certified Cloud Practitioner\n5 years experience with Java and AWS."
    });

    expect(analysis.candidateName).toBe("Alex Smith");
    expect(analysis.structured.certifications.join(" ")).toMatch(/AWS Certified|Cloud Practitioner/i);
    expect(maskDemographicSignals(analysis.structured.biasMaskedText)).toContain("[email masked]");
  });
});
