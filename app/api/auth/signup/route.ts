import { NextResponse } from "next/server";
import { setSessionUser } from "@/lib/auth";
import { createCredentialUser } from "@/lib/auth-model";
import { appendAuditEvent } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const user = await createCredentialUser({
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      role: String(body.role ?? "employee")
    });

    await setSessionUser(user);
    await appendAuditEvent({
      actor: user.email,
      action: "signup",
      details: { role: user.role }
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed." },
      { status: 400 }
    );
  }
}
