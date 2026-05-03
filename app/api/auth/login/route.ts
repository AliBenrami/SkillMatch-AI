import { NextResponse } from "next/server";
import { setSessionUser } from "@/lib/auth";
import { verifyCredentials } from "@/lib/auth-model";
import { appendAuditEvent } from "@/lib/db";
import { loginRequestSchema, parseJsonRequestBody } from "@/lib/validation";

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
  try {
    const { data, error } = await parseJsonRequestBody(loginRequestSchema, request);
    if (!data) {
      if (error === "Malformed JSON body.") {
        await appendLoginAuditEvent({
          actor: "anonymous",
          action: "failed_login",
          details: { reason: "malformed_json" }
        });
      }

      return NextResponse.json({ error }, { status: 400 });
    }

    const { email, password } = data;
    const user = await verifyCredentials(email, password);

    if (!user) {
      await appendLoginAuditEvent({
        actor: email || "anonymous",
        action: "failed_login",
        details: { reason: "invalid_credentials" }
      });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await setSessionUser(user);
    await appendLoginAuditEvent({
      actor: user.email,
      action: "login",
      details: { role: user.role }
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Unable to complete login", error);
    return NextResponse.json({ error: "Sign in is temporarily unavailable." }, { status: 500 });
  }
}
