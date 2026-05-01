import { NextResponse } from "next/server";
import { setSessionUser } from "@/lib/auth";
import { demoUsers, type UserRole } from "@/lib/auth-model";
import { appendAuditEvent } from "@/lib/db";

async function appendLoginAuditEvent(input: {
  actor: string;
  action: "failed_login" | "login";
  details: Record<string, unknown>;
}) {
  try {
    await appendAuditEvent(input);
  } catch (error) {
    console.error("Unable to append login audit event", error);
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email ?? "");
  const role = String(body.role ?? "employee") as UserRole;
  const user = demoUsers.find((item) => item.email === email);

  if (!user || !email.endsWith("@amazon.com")) {
    await appendLoginAuditEvent({
      actor: email || "anonymous",
      action: "failed_login",
      details: { reason: "invalid_internal_account" }
    });
    return NextResponse.json({ error: "Amazon internal account required." }, { status: 401 });
  }

  const sessionUser = { ...user, role };
  await setSessionUser(sessionUser);
  await appendLoginAuditEvent({
    actor: sessionUser.email,
    action: "login",
    details: { role: sessionUser.role }
  });

  return NextResponse.json({ user: sessionUser });
}
