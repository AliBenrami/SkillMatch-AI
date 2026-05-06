import { describe, expect, it } from "vitest";
import { buildLearningReport } from "@/lib/learning-report";
import { analyzeCandidateResume } from "@/lib/skillmatch";

function buildCandidate(input: { fileName: string; resumeText: string }) {
  return analyzeCandidateResume({
    fileName: input.fileName,
    storageUrl: `local://${input.fileName}`,
    resumeText: input.resumeText,
  });
}

describe("buildLearningReport", () => {
  const candidates = [
    buildCandidate({
      fileName: "alex.txt",
      resumeText: [
        "Alex Smith",
        "Java engineer with 4 years experience.",
        "Skills: Java, AWS, SQL, Git, REST API.",
      ].join("\n"),
    }),
    buildCandidate({
      fileName: "blake.txt",
      resumeText: [
        "Blake Doe",
        "Java engineer with 5 years experience.",
        "Skills: Java, SQL, REST API.",
      ].join("\n"),
    }),
    buildCandidate({
      fileName: "casey.txt",
      resumeText: [
        "Casey Lee",
        "Data analyst with 3 years experience.",
        "Skills: SQL, Excel, Python, dashboarding.",
      ].join("\n"),
    }),
  ];

  it("groups missing skills by department", () => {
    const report = buildLearningReport(candidates);
    expect(report.totalCandidates).toBe(3);
    expect(report.topMissingSkills.length).toBeGreaterThan(0);
    const departmentNames = report.byDepartment.map((group) => group.groupName);
    expect(departmentNames.length).toBeGreaterThan(0);
    const firstGroup = report.byDepartment[0];
    expect(firstGroup.candidateCount).toBeGreaterThan(0);
    expect(firstGroup.topMissingSkills.length).toBeGreaterThan(0);
    expect(firstGroup.topMissingSkills[0].affectedCandidates).toBeGreaterThan(0);
  });

  it("groups by employee group derived from role level", () => {
    const report = buildLearningReport(candidates);
    const names = report.byEmployeeGroup.map((group) => group.groupName);
    expect(names.length).toBeGreaterThan(0);
    expect(report.byEmployeeGroup.every((group) => group.candidateCount > 0)).toBe(true);
  });

  it("groups by role family with prioritized recommendations", () => {
    const report = buildLearningReport(candidates);
    expect(report.byRoleFamily.length).toBeGreaterThan(0);
    const first = report.byRoleFamily[0];
    expect(first.prioritizedRecommendation).toContain(first.groupName);
    expect(first.topMissingSkills[0].recommendation).toBeTruthy();
  });

  it("orders top missing skills by affected candidate count", () => {
    const report = buildLearningReport(candidates);
    const groupWithMultiple = report.byRoleFamily.find((group) => group.topMissingSkills.length > 1);
    if (!groupWithMultiple) {
      return;
    }
    for (let i = 1; i < groupWithMultiple.topMissingSkills.length; i++) {
      expect(groupWithMultiple.topMissingSkills[i - 1].affectedCandidates).toBeGreaterThanOrEqual(
        groupWithMultiple.topMissingSkills[i].affectedCandidates,
      );
    }
  });

  it("returns empty groups when no candidates are provided", () => {
    const report = buildLearningReport([]);
    expect(report.totalCandidates).toBe(0);
    expect(report.topMissingSkills).toEqual([]);
    expect(report.byDepartment).toEqual([]);
    expect(report.byEmployeeGroup).toEqual([]);
    expect(report.byRoleFamily).toEqual([]);
  });
});
