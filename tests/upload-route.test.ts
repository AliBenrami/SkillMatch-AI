import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateAnalysis } from "@/lib/skillmatch";

const {
  mockGetSessionUser,
  mockSaveAnalysis,
  mockSaveCandidateBatch,
  mockBuildCandidateDuplicateIdentity,
  mockExtractResumeText,
  mockAnalyzeCandidateResume,
  mockInferCandidateName,
  mockStoreResumeFile
} = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockSaveAnalysis: vi.fn(),
  mockSaveCandidateBatch: vi.fn(),
  mockBuildCandidateDuplicateIdentity: vi.fn(),
  mockExtractResumeText: vi.fn(),
  mockAnalyzeCandidateResume: vi.fn(),
  mockInferCandidateName: vi.fn(),
  mockStoreResumeFile: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: mockGetSessionUser
}));

vi.mock("@/lib/db", () => ({
  saveAnalysis: mockSaveAnalysis,
  saveCandidateBatch: mockSaveCandidateBatch,
  buildCandidateDuplicateIdentity: mockBuildCandidateDuplicateIdentity
}));

vi.mock("@/lib/resume-parser", () => ({
  extractResumeText: mockExtractResumeText
}));

vi.mock("@/lib/skillmatch", () => ({
  analyzeCandidateResume: mockAnalyzeCandidateResume,
  inferCandidateName: mockInferCandidateName
}));

vi.mock("@/lib/storage", () => ({
  storeResumeFile: mockStoreResumeFile
}));

import { POST as uploadPost } from "@/app/api/upload/route";

function createUploadRequest(formData: FormData) {
  return {
    formData: async () => formData
  } as Request;
}

function createCandidate(id: string, fileName: string, candidateName = "Alex Smith"): CandidateAnalysis {
  return {
    id,
    candidateName,
    fileName,
    storageUrl: `local://resumes/${id}.pdf`,
    structured: {
      skills: ["TypeScript"],
      yearsExperience: 5,
      education: ["Bachelor's degree"],
      location: "Remote",
      certifications: [],
      biasMaskedText: "masked"
    },
    topPositions: [
      {
        role: {
          id: "sde-i",
          title: "Software Engineer I",
          requiredSkills: [],
          preferredSkills: [],
          learning: {}
        },
        extractedSkills: ["TypeScript"],
        structured: {
          skills: ["TypeScript"],
          yearsExperience: 5,
          education: ["Bachelor's degree"],
          location: "Remote",
          certifications: [],
          biasMaskedText: "masked"
        },
        matchedSkills: ["TypeScript"],
        missingSkills: [],
        score: 90,
        explanation: "good fit",
        explanationDetails: {
          weights: { required: 1, preferred: 1 },
          earnedWeight: 1,
          possibleWeight: 1,
          required: { matched: 0, total: 0, missing: [] },
          preferred: { matched: 0, total: 0, missing: [] },
          evidence: [],
          rankingFactors: []
        },
        rank: 1
      }
    ],
    aiInsight: null,
    createdAt: "2026-05-03T00:00:00.000Z"
  } as unknown as CandidateAnalysis;
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({
      name: "Recruiter",
      email: "recruiter@skillmatch.demo",
      role: "recruiter"
    });
    mockInferCandidateName.mockReturnValue("Alex Smith");
    mockBuildCandidateDuplicateIdentity.mockImplementation(({ candidateName, fileName, resumeText }) => {
      const identitySuffix = resumeText.includes("distributed systems") ? "resume-a" : "resume-b";
      return {
        duplicateKey: `${candidateName}:${identitySuffix}`,
        clusterKey: `${candidateName}:${fileName.replace(/\.[^.]+$/, "").toLowerCase()}`
      };
    });
  });

  it("skips same-batch duplicate uploads before persistence and returns a structured warning", async () => {
    const candidate = createCandidate("cand-1", "Alex-Smith.pdf");
    mockExtractResumeText.mockResolvedValue({
      text: "Alex Smith\nTypeScript engineer with five years of distributed systems experience.",
      bytes: new Uint8Array([1, 2, 3])
    });
    mockStoreResumeFile.mockResolvedValue({ url: candidate.storageUrl });
    mockAnalyzeCandidateResume.mockReturnValue(candidate);
    mockSaveCandidateBatch.mockResolvedValue({ candidates: [candidate], duplicates: [] });

    const formData = new FormData();
    formData.append("resumes", new File(["one"], "Alex-Smith.pdf", { type: "application/pdf" }));
    formData.append("resumes", new File(["two"], "Alex-Smith.pdf", { type: "application/pdf" }));

    const response = await uploadPost(createUploadRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidates: [candidate],
      duplicates: [
        {
          type: "exact_duplicate",
          source: "upload_batch",
          candidateName: "Alex Smith",
          fileName: "Alex-Smith.pdf",
          duplicateKey: "Alex Smith:resume-a",
          clusterKey: "Alex Smith:alex-smith",
          message: "Skipped duplicate resume upload in the same batch."
        }
      ],
      failures: []
    });
    expect(mockStoreResumeFile).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeCandidateResume).toHaveBeenCalledTimes(1);
    expect(mockSaveCandidateBatch).toHaveBeenCalledWith({
      actor: "recruiter@skillmatch.demo",
      uploads: [
        {
          candidate,
          resumeText: "Alex Smith\nTypeScript engineer with five years of distributed systems experience.",
          duplicateKey: "Alex Smith:resume-a",
          clusterKey: "Alex Smith:alex-smith"
        }
      ]
    });
    expect(mockSaveAnalysis).toHaveBeenCalledTimes(1);
  });

  it("surfaces existing-record duplicate warnings from the batch save and avoids analysis writes for skipped records", async () => {
    const candidate = createCandidate("cand-2", "Jordan-Lee.pdf", "Jordan Lee");
    mockInferCandidateName.mockReturnValue("Jordan Lee");
    mockBuildCandidateDuplicateIdentity.mockReturnValue({
      duplicateKey: "Jordan Lee:72",
      clusterKey: "Jordan Lee:jordan-lee"
    });
    mockExtractResumeText.mockResolvedValue({
      text: "Jordan Lee\nFull-stack engineer with React, SQL, and API platform experience.",
      bytes: new Uint8Array([4, 5, 6])
    });
    mockStoreResumeFile.mockResolvedValue({ url: candidate.storageUrl });
    mockAnalyzeCandidateResume.mockReturnValue(candidate);
    mockSaveCandidateBatch.mockResolvedValue({
      candidates: [],
      duplicates: [
        {
          type: "exact_duplicate",
          source: "existing_records",
          candidateName: "Jordan Lee",
          fileName: "Jordan-Lee.pdf",
          duplicateKey: "Jordan Lee:72",
          clusterKey: "Jordan Lee:jordan-lee",
          matchedCandidateId: "existing-analysis-id",
          message: "Skipped duplicate resume upload."
        }
      ]
    });

    const formData = new FormData();
    formData.append("resumes", new File(["resume"], "Jordan-Lee.pdf", { type: "application/pdf" }));

    const response = await uploadPost(createUploadRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidates: [],
      duplicates: [
        {
          type: "exact_duplicate",
          source: "existing_records",
          candidateName: "Jordan Lee",
          fileName: "Jordan-Lee.pdf",
          duplicateKey: "Jordan Lee:72",
          clusterKey: "Jordan Lee:jordan-lee",
          matchedCandidateId: "existing-analysis-id",
          message: "Skipped duplicate resume upload."
        }
      ],
      failures: []
    });
    expect(mockSaveAnalysis).not.toHaveBeenCalled();
  });

});

describe("saveCandidateBatch memory duplicate detection", () => {
  beforeEach(async () => {
    const actualDb = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
    actualDb.resetCandidateRecommendationsForTests();
  });

  it("blocks exact duplicates and emits candidate-cluster warnings without dropping distinct resumes", async () => {
    const actualDb = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
    const firstResumeText = "Alex Smith TypeScript engineer with AWS and distributed systems experience.";
    const clusteredResumeText = "Alex Smith platform engineer with React, SQL, and product delivery experience.";
    const firstIdentity = actualDb.buildCandidateDuplicateIdentity({
      candidateName: "Alex Smith",
      fileName: "Alex-Smith.pdf",
      resumeText: firstResumeText
    });
    const duplicateIdentity = actualDb.buildCandidateDuplicateIdentity({
      candidateName: "Alex Smith",
      fileName: "Alex-Smith.pdf",
      resumeText: firstResumeText
    });
    const clusteredIdentity = actualDb.buildCandidateDuplicateIdentity({
      candidateName: "Alex Smith",
      fileName: "Alex-Smith.pdf",
      resumeText: clusteredResumeText
    });

    const firstSave = await actualDb.saveCandidateBatch({
      actor: "recruiter@skillmatch.demo",
      uploads: [
        {
          candidate: createCandidate("memory-1", "Alex-Smith.pdf"),
          resumeText: firstResumeText,
          duplicateKey: firstIdentity.duplicateKey,
          clusterKey: firstIdentity.clusterKey
        }
      ]
    });
    const duplicateSave = await actualDb.saveCandidateBatch({
      actor: "recruiter@skillmatch.demo",
      uploads: [
        {
          candidate: createCandidate("memory-2", "Alex-Smith.pdf"),
          resumeText: firstResumeText,
          duplicateKey: duplicateIdentity.duplicateKey,
          clusterKey: duplicateIdentity.clusterKey
        }
      ]
    });
    const clusteredSave = await actualDb.saveCandidateBatch({
      actor: "recruiter@skillmatch.demo",
      uploads: [
        {
          candidate: createCandidate("memory-3", "Alex-Smith.pdf"),
          resumeText: clusteredResumeText,
          duplicateKey: clusteredIdentity.duplicateKey,
          clusterKey: clusteredIdentity.clusterKey
        }
      ]
    });

    expect(firstSave.candidates).toHaveLength(1);
    expect(firstSave.duplicates).toHaveLength(0);
    expect(duplicateSave.candidates).toHaveLength(0);
    expect(duplicateSave.duplicates).toEqual([
      expect.objectContaining({
        type: "exact_duplicate",
        source: "existing_records",
        candidateName: "Alex Smith",
        fileName: "Alex-Smith.pdf",
        duplicateKey: duplicateIdentity.duplicateKey,
        clusterKey: duplicateIdentity.clusterKey
      })
    ]);
    expect(clusteredSave.candidates).toHaveLength(1);
    expect(clusteredSave.duplicates).toEqual([
      expect.objectContaining({
        type: "candidate_cluster",
        source: "existing_records",
        candidateName: "Alex Smith",
        fileName: "Alex-Smith.pdf",
        duplicateKey: clusteredIdentity.duplicateKey,
        clusterKey: clusteredIdentity.clusterKey
      })
    ]);
  });
});
