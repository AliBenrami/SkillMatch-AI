import { describe, expect, it } from "vitest";
import { canAccess, createSessionToken, parseSessionToken } from "@/lib/auth";
import { createPasswordHash, verifyCredentials, type SessionUser } from "@/lib/auth-model";

const admin: SessionUser = {
  name: "Admin",
  email: "admin@amazon.com",
  role: "system_admin"
};

describe("auth and RBAC", () => {
  it("round-trips signed session tokens", () => {
    const token = createSessionToken(admin);
    expect(parseSessionToken(token)).toEqual(admin);
  });

  it("rejects tampered session tokens", () => {
    const token = createSessionToken(admin);
    expect(parseSessionToken(`${token}tampered`)).toBeNull();
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
});
