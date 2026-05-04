import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/db";
import { overrideRequestSchema, parseJsonRequestBody } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!canAccess(user, "recruiter")) {
    return NextResponse.json({ error: "Recruiter access required." }, { status: 403 });
  }

  const { data, error } = await parseJsonRequestBody(overrideRequestSchema, request);
  if (!data) {
    if (error === "Malformed JSON body.") {
      await appendAuditEvent({
        actor: user.email,
        action: "recruiter_override",
        details: { reason: "malformed_json" }
      });
    }

    return NextResponse.json({ error }, { status: 400 });
  }

  await appendAuditEvent({
    actor: user.email,
    action: "recruiter_override",
    entityId: data.candidateId,
    details: {
      promotedRole: data.promotedRole,
      reason: data.reason
    }
  });

  return NextResponse.json({ ok: true });
}
