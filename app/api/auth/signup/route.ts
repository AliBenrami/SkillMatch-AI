import { NextResponse } from "next/server";
import { setSessionUser } from "@/lib/auth";
import { createCredentialUser } from "@/lib/auth-model";
import { appendAuditEvent } from "@/lib/db";
import { parseJsonRequest, signupRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const { data, error } = parseJsonRequest(signupRequestSchema, await request.json());
  if (!data) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    const user = await createCredentialUser(data);

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
