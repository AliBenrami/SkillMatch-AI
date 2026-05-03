import { describe, expect, it } from "vitest";
import {
  analyzeCandidateResume,
  analyzeResume,
  extractSkills,
  maskDemographicSignals,
  normalizeResumeText,
  rankResumeForPositions
} from "@/lib/skillmatch";
import { filterCandidateRecommendations } from "@/lib/db";

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
    expect(result.explanation).toContain("required skills count 2x");
    expect(result.explanationDetails.earnedWeight).toBeGreaterThan(result.matchedSkills.length);
  });

  it("falls back to a known role when an invalid role id is provided", () => {
    const result = analyzeResume("TypeScript React JavaScript Node SQL Git testing", "not-a-role");

    expect(result.role.id).toBe("sde-i");
  });

  it("ranks good positions for each resume", () => {
    const recommendations = rankResumeForPositions(
      "Java engineer with AWS, SQL, REST API, Git, system design, Docker, and data structures experience."
    );

    expect(recommendations[0].role.id).toBe("sde-ii");
    expect(recommendations[0].score).toBeGreaterThan(70);
    expect(recommendations[0].explanationDetails.rankingFactors[0]).toContain("Rank 1");
  });

  it("matches configured skill aliases and equivalent spellings", () => {
    const result = analyzeResume(
      "Backend engineer shipping REST services with continuous integration, GitHub, and Amazon Web Services.",
      "sde-ii"
    );

    expect(result.matchedSkills).toEqual(expect.arrayContaining(["rest api", "ci cd", "git", "aws"]));
    expect(result.explanationDetails.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill: "rest api",
          matchedText: "rest"
        }),
        expect.objectContaining({
          skill: "ci cd",
          matchedText: "continuous integration"
        })
      ])
    );
  });

  it("captures evidence snippets for partial skill matches", () => {
    const result = analyzeResume(
      "Built executive dashboards in Tableau and maintained spreadsheets for weekly statistics reporting.",
      "data-analyst"
    );

    expect(result.matchedSkills).toEqual(expect.arrayContaining(["dashboarding", "excel", "statistics", "tableau"]));
    expect(result.explanationDetails.evidence.find((item) => item.skill === "dashboarding")?.snippet).toContain(
      "dashboards"
    );
  });

  it("returns a zero score and full gaps when no resume skills match", () => {
    const result = analyzeResume("Opera performer with culinary training and event hosting experience.", "sde-i");

    expect(result.score).toBe(0);
    expect(result.matchedSkills).toEqual([]);
    expect(result.explanationDetails.evidence).toEqual([]);
    expect(result.missingSkills).toHaveLength(10);
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
    expect(analysis.structured.location).toBeNull();
    expect(maskDemographicSignals(analysis.structured.biasMaskedText)).toContain("[email masked]");
  });

  it("extracts candidate location for filtering", () => {
    const analysis = analyzeCandidateResume({
      fileName: "casey-lee-resume.txt",
      storageUrl: "local://resume",
      resumeText: "Casey Lee\nLocation: Seattle, WA\nBachelor Computer Science\n4 years experience with Java and AWS."
    });

    expect(analysis.structured.location).toBe("Seattle, WA");
  });

  it("filters candidate recommendations by skills, education, location, and years of experience", () => {
    const seattleEngineer = analyzeCandidateResume({
      fileName: "casey-lee-resume.txt",
      storageUrl: "local://casey",
      resumeText: [
        "Casey Lee",
        "Location: Seattle, WA",
        "Bachelor Computer Science",
        "5 years experience with Java, AWS, SQL, REST API, and Git."
      ].join("\n")
    });
    const austinAnalyst = analyzeCandidateResume({
      fileName: "riley-data-resume.txt",
      storageUrl: "local://riley",
      resumeText: [
        "Riley Data",
        "Location: Austin, TX",
        "Master of Statistics",
        "2 years experience with SQL, Python, Excel, Tableau, and dashboarding."
      ].join("\n")
    });

    const results = filterCandidateRecommendations([seattleEngineer, austinAnalyst], {
      skills: ["java", "aws"],
      education: "Bachelor",
      location: "Seattle",
      minYearsExperience: 4
    });

    expect(results).toHaveLength(1);
    expect(results[0].candidateName).toBe("Casey Lee");
  });

  it("masks explicit demographic fields beyond contact details", () => {
    const masked = maskDemographicSignals(
      [
        "Jamie Doe",
        "jamie@example.com",
        "312-555-0199",
        "Gender: Female",
        "Pronouns: she/her",
        "Race: Asian",
        "Nationality: Canadian",
        "Age: 29",
        "Veteran Status: Protected Veteran"
      ].join("\n")
    );

    expect(masked).toContain("[name masked]");
    expect(masked).toContain("[email masked]");
    expect(masked).toContain("[phone masked]");
    expect(masked).toContain("[gender masked]");
    expect(masked).toContain("[pronouns masked]");
    expect(masked).toContain("[demographic masked]");
    expect(masked).toContain("[age masked]");
    expect(masked).not.toMatch(/\bFemale|Asian|Canadian|29|Protected Veteran|she\/her\b/);
  });

  it("keeps scoring stable across equivalent resumes with different demographic details", () => {
    const sharedExperience =
      "Backend engineer with 6 years experience building TypeScript, React, Node, SQL, Git, AWS, CI/CD, and REST API systems.";
    const resumeA = [
      "Jordan Lee",
      "Gender: Female",
      "Pronouns: she/her",
      "Race: Asian",
      "Age: 29",
      sharedExperience
    ].join("\n");
    const resumeB = [
      "Jordan Lee",
      "Gender: Male",
      "Pronouns: he/him",
      "Race: Black",
      "Age: 46",
      sharedExperience
    ].join("\n");

    const resultA = analyzeResume(resumeA, "sde-ii");
    const resultB = analyzeResume(resumeB, "sde-ii");

    expect(resultA.score).toBe(resultB.score);
    expect(resultA.matchedSkills).toEqual(resultB.matchedSkills);
    expect(resultA.missingSkills).toEqual(resultB.missingSkills);
    expect(resultA.explanationDetails.earnedWeight).toBe(resultB.explanationDetails.earnedWeight);
  });
});
