import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { appendAuditEvent, resolveAdminAlert } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!canAccess(user, "admin")) {
    return NextResponse.json(
      { error: "System administrator role required." },
      { status: user ? 403 : 401 },
    );
  }

  const { id } = await params;
  const alert = await resolveAdminAlert({ id, resolvedBy: user!.email });
  if (!alert) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }

  await appendAuditEvent({
    actor: user!.email,
    actorRole: user!.role,
    actorName: user!.name,
    action: "admin_alert_resolved",
    entityId: alert.id,
    details: { source: alert.source, severity: alert.severity },
  });

  return NextResponse.json({ alert });
}
