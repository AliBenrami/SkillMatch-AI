import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionUser, mockListAnalyses, mockSaveAnalysis, mockAnalyzeResume } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockListAnalyses: vi.fn(),
  mockSaveAnalysis: vi.fn(),
  mockAnalyzeResume: vi.fn()
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSessionUser: mockGetSessionUser
  };
});

vi.mock("@/lib/db", () => ({
  listAnalyses: mockListAnalyses,
  saveAnalysis: mockSaveAnalysis
}));

vi.mock("@/lib/skillmatch", () => ({
  analyzeResume: mockAnalyzeResume
}));

import { GET as analysesGet } from "@/app/api/analyses/route";
import { POST as analyzePost } from "@/app/api/analyze/route";

describe("analyze and analyses API authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated GET /api/analyses with 401", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const response = await analysesGet();

    expect(response.status).toBe(401);
    expect(mockListAnalyses).not.toHaveBeenCalled();
  });

  it("rejects authenticated users without recruiter or L&D access for GET /api/analyses", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Pat",
      email: "pat@skillmatch.demo",
      role: "employee"
    });
    const response = await analysesGet();

    expect(response.status).toBe(403);
    expect(mockListAnalyses).not.toHaveBeenCalled();
  });

  it("allows recruiters to list analyses", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Recruiter",
      email: "recruiter@skillmatch.demo",
      role: "recruiter"
    });
    mockListAnalyses.mockResolvedValue([]);

    const response = await analysesGet();
    expect(response.status).toBe(200);
    expect(mockListAnalyses).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated POST /api/analyze with 401", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const response = await analyzePost(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeName: "Demo",
          resumeText: "x".repeat(30),
          roleId: "sde-i"
        })
      })
    );

    expect(response.status).toBe(401);
    expect(mockAnalyzeResume).not.toHaveBeenCalled();
    expect(mockSaveAnalysis).not.toHaveBeenCalled();
  });
});
