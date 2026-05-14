import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSetSessionUser,
  mockGetSessionUser,
  mockCanAccess,
  mockVerifyCredentials,
  mockGetLoginThrottleStatus,
  mockRecordFailedLoginAttempt,
  mockResetLoginThrottle,
  mockAppendAuditEvent,
  mockSaveAnalysis,
  mockAnalyzeResume
} = vi.hoisted(() => ({
  mockSetSessionUser: vi.fn(),
  mockGetSessionUser: vi.fn(),
  mockCanAccess: vi.fn(),
  mockVerifyCredentials: vi.fn(),
  mockGetLoginThrottleStatus: vi.fn(),
  mockRecordFailedLoginAttempt: vi.fn(),
  mockResetLoginThrottle: vi.fn(),
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
  verifyCredentials: mockVerifyCredentials,
  getLoginThrottleStatus: mockGetLoginThrottleStatus,
  recordFailedLoginAttempt: mockRecordFailedLoginAttempt,
  resetLoginThrottle: mockResetLoginThrottle
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
    mockGetLoginThrottleStatus.mockReturnValue({
      throttled: false,
      scope: null,
      retryAfterSeconds: 0
    });
    mockRecordFailedLoginAttempt.mockReturnValue({
      throttled: false,
      scope: null,
      retryAfterSeconds: 0
    });
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

  it("returns 429 and audits when the login request is already throttled", async () => {
    mockGetLoginThrottleStatus.mockReturnValue({
      throttled: true,
      scope: "ip",
      retryAfterSeconds: 90
    });

    const response = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.9"
        },
        body: JSON.stringify({ email: "blocked@example.com", password: "bad-password" })
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    await expect(response.json()).resolves.toEqual({
      error: "Too many login attempts. Try again later.",
      retryAfterSeconds: 90
    });
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
    expect(mockAppendAuditEvent).toHaveBeenCalledWith({
      actor: "blocked@example.com",
      action: "failed_login",
      details: {
        reason: "login_throttled",
        throttleScope: "ip",
        retryAfterSeconds: 90,
        ip: "203.0.113.9"
      }
    });
  });

  it("returns 429 when a failed credential attempt trips the throttle", async () => {
    mockVerifyCredentials.mockResolvedValue(null);
    mockRecordFailedLoginAttempt.mockReturnValue({
      throttled: true,
      scope: "email",
      retryAfterSeconds: 120
    });

    const response = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "198.51.100.11"
        },
        body: JSON.stringify({ email: "user@example.com", password: "wrong-password" })
      })
    );

    expect(response.status).toBe(429);
    expect(mockRecordFailedLoginAttempt).toHaveBeenCalledWith({
      email: "user@example.com",
      ip: "198.51.100.11"
    });
    expect(mockAppendAuditEvent).toHaveBeenCalledWith({
      actor: "user@example.com",
      action: "failed_login",
      details: {
        reason: "login_throttled",
        throttleScope: "email",
        retryAfterSeconds: 120,
        ip: "198.51.100.11"
      }
    });
  });

  it("clears throttle state after a successful login", async () => {
    mockVerifyCredentials.mockResolvedValue({
      name: "Demo Admin",
      email: "admin@example.com",
      role: "system_admin"
    });

    const response = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.12, 10.0.0.10"
        },
        body: JSON.stringify({ email: "admin@example.com", password: "correct-password" })
      })
    );

    expect(response.status).toBe(200);
    expect(mockResetLoginThrottle).toHaveBeenCalledWith({
      email: "admin@example.com",
      ip: "198.51.100.12"
    });
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
