import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionUser } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getSessionUser: mockGetSessionUser,
  };
});

import { GET as listAlerts, POST as createAlert } from "@/app/api/admin-alerts/route";
import { POST as resolveRoute } from "@/app/api/admin-alerts/[id]/resolve/route";
import { resetAdminAlertsForTests, resetAuditEventsForTests } from "@/lib/db";

beforeEach(() => {
  resetAdminAlertsForTests();
  resetAuditEventsForTests();
  mockGetSessionUser.mockReset();
});

afterEach(() => {
  resetAdminAlertsForTests();
  resetAuditEventsForTests();
});

const adminUser = {
  name: "Yash Admin",
  email: "admin@skillmatch.demo",
  role: "system_admin" as const,
};
const recruiter = { name: "Priya Recruiter", email: "recruiter@skillmatch.demo", role: "recruiter" as const };

describe("/api/admin-alerts", () => {
  it("rejects non-admin users", async () => {
    mockGetSessionUser.mockResolvedValue(recruiter);
    const response = await listAlerts(new Request("http://localhost/api/admin-alerts"));
    expect(response.status).toBe(403);
  });

  it("returns alerts for admin users", async () => {
    mockGetSessionUser.mockResolvedValue(adminUser);
    const create = await createAlert(
      new Request("http://localhost/api/admin-alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "sync",
          severity: "info",
          message: "Future sync placeholder (demo simulation).",
        }),
      }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { alert: { id: string; status: string } };
    expect(created.alert.status).toBe("open");

    const list = await listAlerts(new Request("http://localhost/api/admin-alerts?status=open"));
    expect(list.status).toBe(200);
    const payload = (await list.json()) as { alerts: Array<{ id: string }> };
    expect(payload.alerts).toHaveLength(1);
    expect(payload.alerts[0].id).toBe(created.alert.id);
  });

  it("validates severity and source", async () => {
    mockGetSessionUser.mockResolvedValue(adminUser);
    const response = await createAlert(
      new Request("http://localhost/api/admin-alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "alien", severity: "info", message: "x" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("resolves an alert and audits the action", async () => {
    mockGetSessionUser.mockResolvedValue(adminUser);
    const create = await createAlert(
      new Request("http://localhost/api/admin-alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "sync",
          severity: "warning",
          message: "Ready to resolve",
        }),
      }),
    );
    const created = (await create.json()) as { alert: { id: string } };

    const resolve = await resolveRoute(
      new Request(`http://localhost/api/admin-alerts/${created.alert.id}/resolve`, { method: "POST" }),
      { params: Promise.resolve({ id: created.alert.id }) },
    );
    expect(resolve.status).toBe(200);
    const resolved = (await resolve.json()) as { alert: { status: string } };
    expect(resolved.alert.status).toBe("resolved");
  });
});
