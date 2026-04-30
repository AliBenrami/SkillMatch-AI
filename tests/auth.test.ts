import { describe, expect, it } from "vitest";
import { canAccess, createSessionToken, parseSessionToken } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth-model";

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
});
