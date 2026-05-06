import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionUser, mockAssignCandidateLearningModules } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockAssignCandidateLearningModules: vi.fn()
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSessionUser: mockGetSessionUser
  };
});

vi.mock("@/lib/db", () => ({
  assignCandidateLearningModules: mockAssignCandidateLearningModules
}));

import { PUT as learningModulesPut } from "@/app/api/candidates/[id]/learning-modules/route";

function updateRequest(moduleIds: string[] = ["sde-ii:AWS"]) {
  return new Request("http://localhost/api/candidates/cand-1/learning-modules", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ moduleIds })
  });
}

function params(id = "cand-1") {
  return { params: Promise.resolve({ id }) };
}

describe("candidate learning modules route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects recruiters because module assignment is limited to L&D and admins", async () => {
    mockGetSessionUser.mockResolvedValue({
      name: "Priya Recruiter",
      email: "recruiter@skillmatch.demo",
      role: "recruiter"
    });

    const response = await learningModulesPut(updateRequest(), params());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Learning and development access required." });
    expect(mockAssignCandidateLearningModules).not.toHaveBeenCalled();
  });

  it("allows learning and development users to assign modules", async () => {
    const candidate = { id: "cand-1", assignedLearningModules: ["sde-ii:AWS"] };
    mockGetSessionUser.mockResolvedValue({
      name: "Lina L&D",
      email: "learning@skillmatch.demo",
      role: "learning_development"
    });
    mockAssignCandidateLearningModules.mockResolvedValue(candidate);

    const response = await learningModulesPut(updateRequest(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ candidate });
    expect(mockAssignCandidateLearningModules).toHaveBeenCalledWith({
      actor: "learning@skillmatch.demo",
      candidateId: "cand-1",
      moduleIds: ["sde-ii:AWS"]
    });
  });
});
