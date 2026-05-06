import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import {
  appendAuditEvent,
  listAdminAlerts,
  recordAdminAlert,
  type AdminAlertSeverity,
  type AdminAlertStatus,
} from "@/lib/db";

const allowedSources = new Set(["storage", "database", "upload", "sync"]);
const allowedSeverity = new Set<AdminAlertSeverity>(["info", "warning", "critical"]);

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!canAccess(user, "admin")) {
    return NextResponse.json(
      { error: "System administrator role required." },
      { status: user ? 403 : 401 },
    );
  }

  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  const status: AdminAlertStatus | undefined =
    statusParam === "open" || statusParam === "resolved" ? statusParam : undefined;

  const alerts = await listAdminAlerts({ status });
  return NextResponse.json({ alerts });
}

/**
 * Admin-triggered placeholder/demo alerts. The real failure paths (storage,
 * database, upload parsing) record alerts directly inside the upload route;
 * this endpoint is mainly used by tests and to seed a "future sync failed"
 * placeholder alert from the dashboard.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!canAccess(user, "admin")) {
    return NextResponse.json(
      { error: "System administrator role required." },
      { status: user ? 403 : 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { source?: unknown; severity?: unknown; message?: unknown; details?: unknown }
    | null;

  if (!body || typeof body.source !== "string" || typeof body.severity !== "string" || typeof body.message !== "string") {
    return NextResponse.json({ error: "source, severity, and message are required." }, { status: 400 });
  }

  if (!allowedSources.has(body.source)) {
    return NextResponse.json(
      { error: `source must be one of: ${Array.from(allowedSources).join(", ")}.` },
      { status: 400 },
    );
  }

  const severity = body.severity as AdminAlertSeverity;
  if (!allowedSeverity.has(severity)) {
    return NextResponse.json({ error: "severity must be info, warning, or critical." }, { status: 400 });
  }

  const details =
    body.details && typeof body.details === "object" && !Array.isArray(body.details)
      ? (body.details as Record<string, unknown>)
      : {};

  const alert = await recordAdminAlert({
    source: body.source,
    severity,
    message: body.message,
    details: { ...details, recordedBy: user!.email },
  });

  await appendAuditEvent({
    actor: user!.email,
    actorRole: user!.role,
    actorName: user!.name,
    action: "admin_alert_created",
    entityId: alert.id,
    details: { source: alert.source, severity: alert.severity, message: alert.message },
  });

  return NextResponse.json({ alert }, { status: 201 });
}
