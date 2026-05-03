import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { listAnalyses } from "@/lib/db";

function canViewAnalysisHistory(user: Awaited<ReturnType<typeof getSessionUser>>) {
  return canAccess(user, "recruiter") || canAccess(user, "learning");
}

export async function GET() {
  const user = await getSessionUser();
  if (!canViewAnalysisHistory(user)) {
    return NextResponse.json({ error: "Authentication required." }, { status: user ? 403 : 401 });
  }

  return NextResponse.json({ analyses: await listAnalyses() });
}
