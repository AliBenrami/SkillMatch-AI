import { NextResponse } from "next/server";
import { analyzeResume } from "@/lib/skillmatch";
import { saveAnalysis } from "@/lib/db";
import { analyzeRequestSchema, parseJsonRequestBody } from "@/lib/validation";

export async function POST(request: Request) {
  const { data, error } = await parseJsonRequestBody(analyzeRequestSchema, request);
  if (!data) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const result = analyzeResume(data.resumeText, data.roleId);
  const saved = await saveAnalysis({
    employeeName: data.employeeName,
    resumeText: data.resumeText,
    result
  });

  return NextResponse.json({ result, saved });
}
