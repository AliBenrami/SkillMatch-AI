import { NextResponse } from "next/server";
import { analyzeResume } from "@/lib/skillmatch";
import { saveAnalysis } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const employeeName = String(body.employeeName || "Demo Employee");
  const resumeText = String(body.resumeText || "");
  const roleId = String(body.roleId || "sde-i");

  if (resumeText.trim().length < 20) {
    return NextResponse.json(
      { error: "Resume text must include at least 20 characters." },
      { status: 400 }
    );
  }

  const result = analyzeResume(resumeText, roleId);
  const saved = await saveAnalysis({ employeeName, resumeText, result });

  return NextResponse.json({ result, saved });
}
