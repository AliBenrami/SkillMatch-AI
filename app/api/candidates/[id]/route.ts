import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { deleteCandidateRecommendation } from "@/lib/db";
import { serverErrorResponse } from "@/lib/server-api-error";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!canAccess(user, "recruiter")) {
    return NextResponse.json(
      { error: "Recruiter, hiring manager, or system administrator access required." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const deleted = await deleteCandidateRecommendation({
      actor: user.email,
      actorRole: user.role,
      actorName: user.name,
      candidateId: id,
    });

    if (!deleted) {
      return NextResponse.json({ error: "Candidate resume not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, ...deleted });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
