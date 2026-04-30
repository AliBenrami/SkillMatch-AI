import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listCandidateRecommendations } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  return NextResponse.json({ candidates: await listCandidateRecommendations() });
}
