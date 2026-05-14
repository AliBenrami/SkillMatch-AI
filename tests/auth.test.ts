import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canAccess, createSessionToken, parseSessionToken } from "@/lib/auth";
import {
  createPasswordHash,
  getLoginThrottleStatus,
  recordFailedLoginAttempt,
  resetLoginThrottle,
  resetLoginThrottleState,
  verifyCredentials,
  type SessionUser
} from "@/lib/auth-model";

const admin: SessionUser = {
  name: "Admin",
  email: "admin@amazon.com",
  role: "system_admin"
};

const originalAuthSecret = process.env.AUTH_SECRET;
const originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: typeof process.env.NODE_ENV) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    enumerable: true,
    writable: true
  });
}

beforeEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.AUTH_LOGIN_MAX_ATTEMPTS;
  delete process.env.AUTH_LOGIN_WINDOW_MINUTES;
  delete process.env.AUTH_LOGIN_LOCKOUT_MINUTES;
  setNodeEnv("test");
  resetLoginThrottleState();
  vi.useRealTimers();
});

afterEach(() => {
  if (originalAuthSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = originalAuthSecret;
  }

  if (originalBetterAuthSecret === undefined) {
    delete process.env.BETTER_AUTH_SECRET;
  } else {
    process.env.BETTER_AUTH_SECRET = originalBetterAuthSecret;
  }

  setNodeEnv(originalNodeEnv);
  delete process.env.AUTH_USERS_JSON;
  delete process.env.AUTH_LOGIN_MAX_ATTEMPTS;
  delete process.env.AUTH_LOGIN_WINDOW_MINUTES;
  delete process.env.AUTH_LOGIN_LOCKOUT_MINUTES;
  resetLoginThrottleState();
  vi.useRealTimers();
});

describe("auth and RBAC", () => {
  it("round-trips signed session tokens", () => {
    const token = createSessionToken(admin);
    expect(parseSessionToken(token)).toEqual(admin);
  });

  it("adds issued-at and expiration data to signed session tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const token = createSessionToken(admin);
    const [payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    expect(decoded).toMatchObject({
      ...admin,
      iat: 1767225600,
      exp: 1767254400
    });
  });

  it("rejects expired session tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createSessionToken(admin);

    vi.setSystemTime(new Date("2026-01-01T08:00:01.000Z"));

    expect(parseSessionToken(token)).toBeNull();
  });

  it("rejects tampered session tokens", () => {
    const token = createSessionToken(admin);
    expect(parseSessionToken(`${token}tampered`)).toBeNull();
  });

  it("rejects sessions with unknown roles before signing", () => {
    expect(() =>
      createSessionToken({
        name: "Mallory",
        email: "mallory@amazon.com",
        role: "super_admin"
      } as unknown as SessionUser)
    ).toThrow();
  });

  it("requires a session secret in production", () => {
    setNodeEnv("production");
    delete process.env.AUTH_SECRET;

    expect(() => createSessionToken(admin)).toThrow(/AUTH_SECRET or BETTER_AUTH_SECRET must be set/);
  });

  it("rejects weak AUTH_SECRET values in production", () => {
    setNodeEnv("production");
    process.env.AUTH_SECRET = "short-secret";

    expect(() => createSessionToken(admin)).toThrow(/AUTH_SECRET must be a strong random value/);
  });

  it("accepts BETTER_AUTH_SECRET as the production session secret", () => {
    setNodeEnv("production");
    process.env.BETTER_AUTH_SECRET = "a-production-secret-with-enough-entropy-12345";

    const token = createSessionToken(admin);

    expect(parseSessionToken(token)).toEqual(admin);
  });

  it("enforces role-based access for admin and recruiter areas", () => {
    expect(canAccess(admin, "admin")).toBe(true);
    expect(canAccess({ ...admin, role: "employee" }, "admin")).toBe(false);
    expect(canAccess({ ...admin, role: "recruiter" }, "recruiter")).toBe(true);
  });

  it("verifies configured credential users", async () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        name: "Demo Admin",
        email: "admin@example.com",
        role: "system_admin",
        passwordHash: createPasswordHash("correct-password", "test-salt")
      }
    ]);

    await expect(verifyCredentials("admin@example.com", "correct-password")).resolves.toEqual({
      name: "Demo Admin",
      email: "admin@example.com",
      role: "system_admin"
    });
    await expect(verifyCredentials("admin@example.com", "wrong-password")).resolves.toBeNull();
    delete process.env.AUTH_USERS_JSON;
  });

  it("throttles login attempts by normalized email and reports retry timing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    process.env.AUTH_LOGIN_MAX_ATTEMPTS = "3";
    process.env.AUTH_LOGIN_LOCKOUT_MINUTES = "10";

    expect(recordFailedLoginAttempt({ email: " Admin@Example.com " })).toEqual({
      throttled: false,
      scope: null,
      retryAfterSeconds: 0
    });
    expect(recordFailedLoginAttempt({ email: "admin@example.com" })).toEqual({
      throttled: false,
      scope: null,
      retryAfterSeconds: 0
    });

    const thirdAttempt = recordFailedLoginAttempt({ email: "admin@example.com" });
    expect(thirdAttempt.throttled).toBe(true);
    expect(thirdAttempt.scope).toBe("email");
    expect(thirdAttempt.retryAfterSeconds).toBe(600);

    expect(getLoginThrottleStatus({ email: "ADMIN@example.com" })).toEqual(thirdAttempt);
  });

  it("throttles by IP independently from email and expires the lockout window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    process.env.AUTH_LOGIN_MAX_ATTEMPTS = "2";
    process.env.AUTH_LOGIN_LOCKOUT_MINUTES = "1";

    recordFailedLoginAttempt({ email: "first@example.com", ip: "203.0.113.10" });
    const throttled = recordFailedLoginAttempt({ email: "second@example.com", ip: "203.0.113.10" });

    expect(throttled.throttled).toBe(true);
    expect(throttled.scope).toBe("ip");
    expect(getLoginThrottleStatus({ email: "other@example.com", ip: "203.0.113.10" }).throttled).toBe(true);

    vi.advanceTimersByTime(60_000);

    expect(getLoginThrottleStatus({ email: "other@example.com", ip: "203.0.113.10" })).toEqual({
      throttled: false,
      scope: null,
      retryAfterSeconds: 0
    });
  });

  it("clears throttle state after a successful login path resets the subject", () => {
    process.env.AUTH_LOGIN_MAX_ATTEMPTS = "2";

    recordFailedLoginAttempt({ email: "user@example.com", ip: "198.51.100.20" });
    recordFailedLoginAttempt({ email: "user@example.com", ip: "198.51.100.20" });

    expect(getLoginThrottleStatus({ email: "user@example.com", ip: "198.51.100.20" }).throttled).toBe(true);

    resetLoginThrottle({ email: "user@example.com", ip: "198.51.100.20" });

    expect(getLoginThrottleStatus({ email: "user@example.com", ip: "198.51.100.20" })).toEqual({
      throttled: false,
      scope: null,
      retryAfterSeconds: 0
    });
  });
});
