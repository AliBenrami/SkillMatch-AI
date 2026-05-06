import { beforeEach, describe, expect, it } from "vitest";
import {
  buildCandidateDuplicateIdentity,
  deleteCandidateRecommendation,
  listAuditEvents,
  listCandidateRecommendations,
  resetAuditEventsForTests,
  resetCandidateRecommendationsForTests,
  saveCandidateBatch,
} from "@/lib/db";
import { analyzeCandidateResume } from "@/lib/skillmatch";
import { getResumeObject, storeResumeFile } from "@/lib/storage";

describe("candidate resume deletion", () => {
  beforeEach(() => {
    resetCandidateRecommendationsForTests();
    resetAuditEventsForTests();
  });

  it("deletes memory fallback candidate rows, local resume objects, and writes an audit event", async () => {
    const resumeText = [
      "Alex Smith",
      "Java engineer with 5 years experience.",
      "Skills: Java, AWS, SQL, REST API, Git, System Design, Data Structures, Docker.",
    ].join("\n");
    const stored = await storeResumeFile({
      fileName: "Alex-Smith.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
    const candidate = analyzeCandidateResume({
      fileName: "Alex-Smith.pdf",
      resumeText,
      storageUrl: stored.url,
    });
    const identity = buildCandidateDuplicateIdentity({
      candidateName: candidate.candidateName,
      fileName: candidate.fileName,
      resumeText,
    });

    await saveCandidateBatch({
      actor: "recruiter@skillmatch.demo",
      actorRole: "recruiter",
      actorName: "Priya Recruiter",
      uploads: [
        {
          candidate,
          resumeText,
          duplicateKey: identity.duplicateKey,
          clusterKey: identity.clusterKey,
        },
      ],
    });

    await expect(listCandidateRecommendations()).resolves.toHaveLength(1);
    await expect(getResumeObject(stored.url)).resolves.not.toBeNull();

    const deleted = await deleteCandidateRecommendation({
      actor: "recruiter@skillmatch.demo",
      actorRole: "recruiter",
      actorName: "Priya Recruiter",
      candidateId: candidate.id,
    });

    expect(deleted).toEqual(
      expect.objectContaining({
        candidateId: candidate.id,
        candidateName: "Alex Smith",
        fileName: "Alex-Smith.pdf",
        resumeObjectDeleted: true,
        resumeObjectDeletionSupported: true,
        mode: "local_memory",
      })
    );
    await expect(listCandidateRecommendations()).resolves.toEqual([]);
    await expect(getResumeObject(stored.url)).resolves.toBeNull();

    const events = await listAuditEvents({ action: "candidate_resume_deleted" });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        actor: "recruiter@skillmatch.demo",
        actorRole: "recruiter",
        action: "candidate_resume_deleted",
        entityId: candidate.id,
      })
    );
    expect(events[0].details).toEqual(
      expect.objectContaining({
        candidateName: "Alex Smith",
        fileName: "Alex-Smith.pdf",
        resumeObjectDeleted: true,
        mode: "local_memory",
      })
    );
  });
});
