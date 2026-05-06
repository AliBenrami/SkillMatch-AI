import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionUser, mockDeleteCandidateRecommendation } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockDeleteCandidateRecommendation: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSessionUser: mockGetSessionUser,
  };
});

vi.mock("@/lib/db", () => ({
  deleteCandidateRecommendation: mockDeleteCandidateRecommendation,
}));

import { DELETE as candidateDelete } from "@/app/api/candidates/[id]/route";

function params(id = "cand-1") {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/candidates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const response = await candidateDelete(new Request("http://localhost/api/candidates/cand-1"), params());

    expect(response.status).toBe(401);
    expect(mockDeleteCandidateRecommendation).not.toHaveBeenCalled();
  });

  it("rejects employees", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Employee",
      email: "employee@skillmatch.demo",
      role: "employee",
    });

    const response = await candidateDelete(new Request("http://localhost/api/candidates/cand-1"), params());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Recruiter, hiring manager, or system administrator access required.",
    });
    expect(mockDeleteCandidateRecommendation).not.toHaveBeenCalled();
  });

  it("allows recruiters to delete candidate resume records", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Priya Recruiter",
      email: "recruiter@skillmatch.demo",
      role: "recruiter",
    });
    mockDeleteCandidateRecommendation.mockResolvedValue({
      candidateId: "cand-1",
      candidateName: "Alex Smith",
      fileName: "Alex-Smith.pdf",
      storageUrl: "local://resumes/alex.pdf",
      resumeObjectDeleted: true,
      resumeObjectDeletionSupported: true,
      mode: "local_memory",
    });

    const response = await candidateDelete(new Request("http://localhost/api/candidates/cand-1"), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      candidateId: "cand-1",
      candidateName: "Alex Smith",
      fileName: "Alex-Smith.pdf",
      storageUrl: "local://resumes/alex.pdf",
      resumeObjectDeleted: true,
      resumeObjectDeletionSupported: true,
      mode: "local_memory",
    });
    expect(mockDeleteCandidateRecommendation).toHaveBeenCalledWith({
      actor: "recruiter@skillmatch.demo",
      actorRole: "recruiter",
      actorName: "Priya Recruiter",
      candidateId: "cand-1",
    });
  });

  it("returns 404 when the candidate record is already gone", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Yash Admin",
      email: "admin@skillmatch.demo",
      role: "system_admin",
    });
    mockDeleteCandidateRecommendation.mockResolvedValue(null);

    const response = await candidateDelete(new Request("http://localhost/api/candidates/missing"), params("missing"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Candidate resume not found." });
  });
});
