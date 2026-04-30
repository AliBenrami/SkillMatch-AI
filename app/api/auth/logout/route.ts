import { NextResponse } from "next/server";
import { clearSessionUser, getSessionUser } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/db";

export async function POST() {
  const user = await getSessionUser();
  await clearSessionUser();
  await appendAuditEvent({
    actor: user?.email ?? "unknown",
    action: "logout",
    details: {}
  });

  return NextResponse.json({ ok: true });
}
