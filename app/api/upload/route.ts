import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { saveAnalysis, saveCandidateBatch } from "@/lib/db";
import { extractResumeText } from "@/lib/resume-parser";
import { analyzeCandidateResume, type CandidateAnalysis } from "@/lib/skillmatch";
import { storeResumeFile } from "@/lib/storage";

const maxFiles = 12;
const maxFileSize = 8 * 1024 * 1024;
const allowedResumeExtensions = /\.(pdf|docx|txt)$/i;
const allowedResumeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  ""
]);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("resumes")
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (!files.length) {
    return NextResponse.json({ error: "Upload at least one PDF or DOCX resume." }, { status: 400 });
  }

  if (files.length > maxFiles) {
    return NextResponse.json({ error: `Upload ${maxFiles} resumes or fewer at a time.` }, { status: 400 });
  }

  const candidates = [];
  const uploadOutputs: { candidate: CandidateAnalysis; resumeText: string }[] = [];
  const failures = [];

  for (const file of files) {
    try {
      if (file.size > maxFileSize) {
        throw new Error("File exceeds 8 MB limit.");
      }

      if (!allowedResumeExtensions.test(file.name) || !allowedResumeTypes.has(file.type)) {
        throw new Error("Only PDF, DOCX, or TXT resumes are supported.");
      }

      const parsed = await extractResumeText(file);
      if (parsed.text.length < 20) {
        throw new Error("Resume text could not be extracted.");
      }

      const stored = await storeResumeFile({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        bytes: parsed.bytes
      });
      const candidate = analyzeCandidateResume({
        fileName: file.name,
        resumeText: parsed.text,
        storageUrl: stored.url
      });
      candidates.push(candidate);
      uploadOutputs.push({ candidate, resumeText: parsed.text });
    } catch (error) {
      failures.push({
        fileName: file.name,
        error: error instanceof Error ? error.message : "Unknown parsing failure"
      });
    }
  }

  if (candidates.length) {
    await saveCandidateBatch({ actor: user.email, candidates });
    for (const { candidate, resumeText } of uploadOutputs) {
      const best = candidate.topPositions[0];
      if (best) {
        await saveAnalysis({
          employeeName: candidate.candidateName,
          resumeText,
          result: best,
          recordAudit: false
        });
      }
    }
  }

  return NextResponse.json({ candidates, failures });
}
