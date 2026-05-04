import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildCandidateDuplicateIdentity, saveAnalysis, saveCandidateBatch, type CandidateDuplicateWarning } from "@/lib/db";
import { extractResumeText } from "@/lib/resume-parser";
import { generateResumeAiInsight, getResumeAiInsightConfig } from "@/lib/resume-ai-insight";
import { analyzeCandidateResume, inferCandidateName, type CandidateAnalysis } from "@/lib/skillmatch";
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
  const uploadOutputs: {
    candidate: CandidateAnalysis;
    resumeText: string;
    duplicateKey: string;
    clusterKey: string;
  }[] = [];
  const failures = [];
  const duplicates: CandidateDuplicateWarning[] = [];
  const seenDuplicateKeys = new Set<string>();
  const seenClusterKeys = new Set<string>();

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

      const candidateName = inferCandidateName(file.name, parsed.text);
      const { duplicateKey, clusterKey } = buildCandidateDuplicateIdentity({
        candidateName,
        fileName: file.name,
        resumeText: parsed.text
      });

      if (seenDuplicateKeys.has(duplicateKey)) {
        duplicates.push({
          type: "exact_duplicate",
          source: "upload_batch",
          candidateName,
          fileName: file.name,
          duplicateKey,
          clusterKey,
          message: "Skipped duplicate resume upload in the same batch."
        });
        continue;
      }

      if (seenClusterKeys.has(clusterKey)) {
        duplicates.push({
          type: "candidate_cluster",
          source: "upload_batch",
          candidateName,
          fileName: file.name,
          duplicateKey,
          clusterKey,
          message: "Candidate is clustered with another resume in the same upload batch."
        });
      }

      seenDuplicateKeys.add(duplicateKey);
      seenClusterKeys.add(clusterKey);

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
      uploadOutputs.push({ candidate, resumeText: parsed.text, duplicateKey, clusterKey });
    } catch (error) {
      failures.push({
        fileName: file.name,
        error: error instanceof Error ? error.message : "Unknown parsing failure"
      });
    }
  }

  const aiConfig = getResumeAiInsightConfig();
  if (aiConfig) {
    for (const { candidate } of uploadOutputs) {
      try {
        candidate.aiInsight = await generateResumeAiInsight({
          config: aiConfig,
          maskedResumeText: candidate.structured.biasMaskedText,
          topRoleTitles: candidate.topPositions.slice(0, 4).map((position) => position.role.title),
          candidateLabel: candidate.candidateName
        });
      } catch {
        candidate.aiInsight = null;
      }
    }
  }

  if (candidates.length) {
    const saved = await saveCandidateBatch({ actor: user.email, uploads: uploadOutputs });
    const savedCandidateIds = new Set(saved.candidates.map((candidate) => candidate.id));
    duplicates.push(...saved.duplicates);

    for (const { candidate, resumeText } of uploadOutputs) {
      if (!savedCandidateIds.has(candidate.id)) {
        continue;
      }

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

    return NextResponse.json({ candidates: saved.candidates, duplicates, failures });
  }

  return NextResponse.json({ candidates, duplicates, failures });
}
