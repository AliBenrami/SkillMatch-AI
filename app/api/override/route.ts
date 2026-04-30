import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/db";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!canAccess(user, "recruiter")) {
    return NextResponse.json({ error: "Recruiter access required." }, { status: 403 });
  }

  const body = await request.json();
  await appendAuditEvent({
    actor: user!.email,
    action: "recruiter_override",
    entityId: String(body.candidateId ?? ""),
    details: {
      promotedRole: String(body.promotedRole ?? ""),
      reason: String(body.reason ?? "Manual review")
    }
  });

  return NextResponse.json({ ok: true });
}
