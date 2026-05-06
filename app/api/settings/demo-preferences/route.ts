import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/db";
import { serverErrorResponse } from "@/lib/server-api-error";

type DemoPreferenceBody = {
  scope?: unknown;
  preferences?: unknown;
};

function preferenceKeys(preferences: unknown) {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    return [];
  }
  return Object.keys(preferences).slice(0, 20);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as DemoPreferenceBody | null;
  if (!body || body.scope !== "admin") {
    return NextResponse.json({ ok: true, audited: false });
  }

  if (!canAccess(user, "admin")) {
    return NextResponse.json({ error: "System administrator access required." }, { status: 403 });
  }

  try {
    await appendAuditEvent({
      actor: user.email,
      actorRole: user.role,
      actorName: user.name,
      action: "admin_settings_updated",
      details: {
        scope: "demo_preferences",
        preferenceKeys: preferenceKeys(body.preferences),
      },
    });

    return NextResponse.json({ ok: true, audited: true });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
