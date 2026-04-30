import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { listAuditEvents } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!canAccess(user, "admin")) {
    return NextResponse.json({ error: "System administrator role required." }, { status: 403 });
  }

  return NextResponse.json({ events: await listAuditEvents() });
}
