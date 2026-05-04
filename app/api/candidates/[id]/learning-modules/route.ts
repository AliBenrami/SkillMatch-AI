import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assignCandidateLearningModules } from "@/lib/db";
import { serverErrorResponse } from "@/lib/server-api-error";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { moduleIds?: unknown } | null;
  if (!body || !Array.isArray(body.moduleIds) || !body.moduleIds.every((item) => typeof item === "string")) {
    return NextResponse.json({ error: "moduleIds must be an array of strings." }, { status: 400 });
  }

  try {
    const candidate = await assignCandidateLearningModules({
      actor: user.email,
      candidateId: id,
      moduleIds: body.moduleIds
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate resume not found." }, { status: 404 });
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
