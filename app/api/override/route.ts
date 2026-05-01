import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/db";
import { overrideRequestSchema, parseJsonRequest } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!canAccess(user, "recruiter")) {
    return NextResponse.json({ error: "Recruiter access required." }, { status: 403 });
  }

  const { data, error } = parseJsonRequest(overrideRequestSchema, await request.json());
  if (!data) {
    return NextResponse.json({ error }, { status: 400 });
  }

  await appendAuditEvent({
    actor: user!.email,
    action: "recruiter_override",
    entityId: data.candidateId,
    details: {
      promotedRole: data.promotedRole,
      reason: data.reason
    }
  });

  return NextResponse.json({ ok: true });
}
