import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { listAuditEvents, verifyAuditIntegrity, type AuditEventFilters } from "@/lib/db";

function parseFilters(url: string): AuditEventFilters {
  const params = new URL(url).searchParams;
  const limitRaw = params.get("limit");
  const limit = limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
  return {
    action: params.get("action")?.trim() || undefined,
    actor: params.get("actor")?.trim() || undefined,
    entityId: params.get("entityId")?.trim() || undefined,
    startDate: params.get("startDate")?.trim() || undefined,
    endDate: params.get("endDate")?.trim() || undefined,
    limit,
  };
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!canAccess(user, "admin")) {
    return NextResponse.json(
      { error: "System administrator role required." },
      { status: user ? 403 : 401 },
    );
  }

  const filters = parseFilters(request.url);
  const events = await listAuditEvents(filters);
  const integrity = await verifyAuditIntegrity();

  return NextResponse.json({ events, integrity });
}
