import { beforeEach, describe, expect, it } from "vitest";
import {
  assignCandidateLearningModules,
  listAuditEvents,
  listCandidateRecommendations,
  resetCandidateRecommendationsForTests,
  saveCandidateBatch,
  type CandidateUploadRecord
} from "@/lib/db";
import { analyzeCandidateResume, type CandidateAnalysis } from "@/lib/skillmatch";

function buildUpload(): CandidateUploadRecord {
  const candidate = analyzeCandidateResume({
    fileName: "alex-resume.txt",
    resumeText: "Alex Smith\nJava AWS TypeScript customer obsession. 3 years experience.",
    storageUrl: "memory://alex-resume.txt"
  });

  return {
    candidate,
    resumeText: "Alex Smith\nJava AWS TypeScript customer obsession. 3 years experience.",
    duplicateKey: `test:${candidate.id}`,
    clusterKey: `cluster:${candidate.id}`
  };
}

describe("candidate learning module assignments", () => {
  beforeEach(() => {
    resetCandidateRecommendationsForTests();
  });

  it("assigns learning modules to a saved resume", async () => {
    const upload = buildUpload();
    const saved = await saveCandidateBatch({ actor: "ld@example.com", uploads: [upload] });
    const candidate = saved.candidates[0] as CandidateAnalysis;

    const updated = await assignCandidateLearningModules({
      actor: "ld@example.com",
      candidateId: candidate.id,
      moduleIds: ["sde-ii:System Design", "sde-ii:System Design", "sde-ii:AWS"]
    });

    expect(updated?.assignedLearningModules).toEqual(["sde-ii:System Design", "sde-ii:AWS"]);
    expect((await listCandidateRecommendations())[0].assignedLearningModules).toEqual([
      "sde-ii:System Design",
      "sde-ii:AWS"
    ]);
    expect((await listAuditEvents())[0].action).toBe("learning_modules_assigned");
  });

  it("returns null when the resume cannot be found", async () => {
    await expect(
      assignCandidateLearningModules({
        actor: "ld@example.com",
        candidateId: "00000000-0000-0000-0000-000000000000",
        moduleIds: ["sde-ii:AWS"]
      })
    ).resolves.toBeNull();
  });
});
