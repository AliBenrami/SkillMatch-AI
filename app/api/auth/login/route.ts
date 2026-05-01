import { NextResponse } from "next/server";
import { setSessionUser } from "@/lib/auth";
import { verifyCredentials } from "@/lib/auth-model";
import { appendAuditEvent } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const user = await verifyCredentials(email, password);

  if (!user) {
    await appendAuditEvent({
      actor: email || "anonymous",
      action: "failed_login",
      details: { reason: "invalid_credentials" }
    });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await setSessionUser(user);
  await appendAuditEvent({
    actor: user.email,
    action: "login",
    details: { role: user.role }
  });

  return NextResponse.json({ user });
}
