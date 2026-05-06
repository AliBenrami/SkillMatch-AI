import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listAdminAlerts,
  recordAdminAlert,
  resetAdminAlertsForTests,
  resolveAdminAlert,
} from "@/lib/db";

beforeEach(() => {
  resetAdminAlertsForTests();
});

afterEach(() => {
  resetAdminAlertsForTests();
});

describe("admin alerts (memory mode)", () => {
  it("records and lists alerts in newest-first order", async () => {
    const first = await recordAdminAlert({
      source: "storage",
      severity: "warning",
      message: "Resume storage failed for alex.pdf",
    });
    const second = await recordAdminAlert({
      source: "database",
      severity: "critical",
      message: "Resume persistence failed",
      details: { count: 3 },
    });

    const alerts = await listAdminAlerts();
    expect(alerts.length).toBe(2);
    expect(alerts[0].id).toBe(second.id);
    expect(alerts[1].id).toBe(first.id);
    expect(alerts[0].status).toBe("open");
  });

  it("filters by status open/resolved", async () => {
    const open = await recordAdminAlert({
      source: "upload",
      severity: "warning",
      message: "Resume parsing failed",
    });
    await recordAdminAlert({
      source: "sync",
      severity: "info",
      message: "Sync placeholder",
    });
    await resolveAdminAlert({ id: open.id, resolvedBy: "admin@example.com" });

    const onlyOpen = await listAdminAlerts({ status: "open" });
    expect(onlyOpen.length).toBe(1);
    expect(onlyOpen[0].status).toBe("open");

    const onlyResolved = await listAdminAlerts({ status: "resolved" });
    expect(onlyResolved.length).toBe(1);
    expect(onlyResolved[0].id).toBe(open.id);
    expect(onlyResolved[0].resolvedBy).toBe("admin@example.com");
    expect(onlyResolved[0].resolvedAt).not.toBeNull();
  });

  it("returns null when resolving an unknown alert", async () => {
    expect(await resolveAdminAlert({ id: "missing", resolvedBy: "x" })).toBeNull();
  });

  it("preserves resolved status when called twice", async () => {
    const alert = await recordAdminAlert({
      source: "storage",
      severity: "warning",
      message: "Sample",
    });
    const first = await resolveAdminAlert({ id: alert.id, resolvedBy: "admin@example.com" });
    const second = await resolveAdminAlert({ id: alert.id, resolvedBy: "another@example.com" });
    expect(first?.status).toBe("resolved");
    expect(second?.status).toBe("resolved");
  });
});
