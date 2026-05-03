import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSetSessionUser,
  mockGetSessionUser,
  mockCanAccess,
  mockVerifyCredentials,
  mockAppendAuditEvent,
  mockSaveAnalysis,
  mockAnalyzeResume
} = vi.hoisted(() => ({
  mockSetSessionUser: vi.fn(),
  mockGetSessionUser: vi.fn(),
  mockCanAccess: vi.fn(),
  mockVerifyCredentials: vi.fn(),
  mockAppendAuditEvent: vi.fn(),
  mockSaveAnalysis: vi.fn(),
  mockAnalyzeResume: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  setSessionUser: mockSetSessionUser,
  getSessionUser: mockGetSessionUser,
  canAccess: mockCanAccess
}));

vi.mock("@/lib/auth-model", () => ({
  verifyCredentials: mockVerifyCredentials
}));

vi.mock("@/lib/db", () => ({
  appendAuditEvent: mockAppendAuditEvent,
  saveAnalysis: mockSaveAnalysis
}));

vi.mock("@/lib/skillmatch", () => ({
  analyzeResume: mockAnalyzeResume
}));

import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as analyzePost } from "@/app/api/analyze/route";
import { POST as overridePost } from "@/app/api/override/route";

describe("API JSON body handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    mockGetSessionUser.mockResolvedValue({
      name: "Priya Recruiter",
      email: "recruiter@skillmatch.demo",
      role: "recruiter"
    });
  });

  it("returns a structured 400 and audits malformed login JSON", async () => {
    const response = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON body." });
    expect(mockAppendAuditEvent).toHaveBeenCalledWith({
      actor: "anonymous",
      action: "failed_login",
      details: { reason: "malformed_json" }
    });
    expect(mockSetSessionUser).not.toHaveBeenCalled();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("returns a structured 400 for malformed analyze JSON", async () => {
    const response = await analyzePost(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON body." });
    expect(mockAnalyzeResume).not.toHaveBeenCalled();
    expect(mockSaveAnalysis).not.toHaveBeenCalled();
  });

  it("returns a structured 400 and audits malformed override JSON", async () => {
    const response = await overridePost(
      new Request("http://localhost/api/override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON body." });
    expect(mockAppendAuditEvent).toHaveBeenCalledWith({
      actor: "recruiter@skillmatch.demo",
      action: "recruiter_override",
      details: { reason: "malformed_json" }
    });
  });
});
