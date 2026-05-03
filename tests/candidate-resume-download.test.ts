import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionUser, mockGetCandidateResumeById, mockGetResumeObject } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockGetCandidateResumeById: vi.fn(),
  mockGetResumeObject: vi.fn()
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSessionUser: mockGetSessionUser
  };
});

vi.mock("@/lib/db", () => ({
  getCandidateResumeById: mockGetCandidateResumeById
}));

vi.mock("@/lib/storage", () => ({
  getResumeObject: mockGetResumeObject
}));

import { GET as downloadResumeGet } from "@/app/api/candidates/[id]/resume/route";

describe("GET /api/candidates/[id]/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when signed out", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const response = await downloadResumeGet(new Request("http://localhost/api/candidates/x/resume"), {
      params: Promise.resolve({ id: "x" })
    });

    expect(response.status).toBe(401);
    expect(mockGetCandidateResumeById).not.toHaveBeenCalled();
  });

  it("returns 404 when candidate is missing", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Recruiter",
      email: "recruiter@skillmatch.demo",
      role: "recruiter"
    });
    mockGetCandidateResumeById.mockResolvedValue(null);

    const response = await downloadResumeGet(new Request("http://localhost/api/candidates/missing/resume"), {
      params: Promise.resolve({ id: "missing" })
    });

    expect(response.status).toBe(404);
    expect(mockGetResumeObject).not.toHaveBeenCalled();
  });

  it("streams bytes when resume object resolves", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Recruiter",
      email: "recruiter@skillmatch.demo",
      role: "recruiter"
    });
    mockGetCandidateResumeById.mockResolvedValue({
      fileName: "Alex-Smith.pdf",
      storageUrl: "local://resumes/2026-01-01/x.pdf"
    });
    mockGetResumeObject.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf"
    });

    const response = await downloadResumeGet(new Request("http://localhost/api/candidates/c1/resume"), {
      params: Promise.resolve({ id: "c1" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("Alex-Smith.pdf");

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(Array.from(buffer)).toEqual([1, 2, 3]);
  });
});
