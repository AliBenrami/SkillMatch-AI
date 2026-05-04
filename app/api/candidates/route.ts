import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listCandidateRecommendations, type CandidateRecommendationFilters } from "@/lib/db";
import { serverErrorResponse } from "@/lib/server-api-error";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const minYears = params.get("minYearsExperience");
  const filters: CandidateRecommendationFilters = {
    skills: params
      .getAll("skill")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
    education: params.get("education")?.trim() || undefined,
    location: params.get("location")?.trim() || undefined,
    minYearsExperience: minYears && Number.isFinite(Number(minYears)) ? Number(minYears) : undefined
  };

  try {
    return NextResponse.json({ candidates: await listCandidateRecommendations(filters) });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
