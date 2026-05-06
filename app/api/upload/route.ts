import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  buildCandidateDuplicateIdentity,
  recordAdminAlert,
  saveAnalysis,
  saveCandidateBatch,
  type CandidateDuplicateWarning,
} from "@/lib/db";
import { extractResumeText } from "@/lib/resume-parser";
import { generateResumeAiInsight, getResumeAiInsightConfig } from "@/lib/resume-ai-insight";
import { expandResumeUploads } from "@/lib/resume-upload-files";
import {
  analyzeCandidateResume,
  inferCandidateName,
  type CandidateAnalysis,
} from "@/lib/skillmatch";
import { isAllowedResumeUpload } from "@/lib/resume-upload-validation";
import { serverErrorResponse } from "@/lib/server-api-error";
import { storeResumeFile } from "@/lib/storage";
import { resumeUploadConfig } from "@/lib/upload-config";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const formData = await request.formData();
  const rawFiles = formData
    .getAll("resumes")
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (!rawFiles.length) {
    return NextResponse.json({ error: "Upload at least one PDF, DOCX, TXT, or ZIP file." }, { status: 400 });
  }

  if (
    rawFiles.length > resumeUploadConfig.maxRawZipUploadCount &&
    rawFiles.some((file) => file.name.toLowerCase().endsWith(".zip"))
  ) {
    return NextResponse.json(
      { error: `Upload ${resumeUploadConfig.maxRawZipUploadCount} zip files or fewer at a time.` },
      { status: 400 }
    );
  }

  for (const file of rawFiles) {
    if (file.name.toLowerCase().endsWith(".zip") && file.size > resumeUploadConfig.maxZipFileSizeBytes) {
      return NextResponse.json(
        { error: `Zip file exceeds ${resumeUploadConfig.maxZipFileSizeLabel} limit.` },
        { status: 400 }
      );
    }
  }

  const expanded = await expandResumeUploads(rawFiles);
  const files = expanded.files;
  const failures: Array<{ fileName: string; error: string }> = [...expanded.failures];

  if (!files.length) {
    return NextResponse.json({ error: "Upload at least one supported resume file.", failures }, { status: 400 });
  }

  if (files.length > resumeUploadConfig.maxBatchResumeCount) {
    return NextResponse.json(
      {
        error: `Upload ${resumeUploadConfig.maxBatchResumeCount} resumes or fewer at a time, including files inside zips.`
      },
      { status: 400 }
    );
  }

  const candidates: CandidateAnalysis[] = [];
  const uploadOutputs: {
    candidate: CandidateAnalysis;
    resumeText: string;
    duplicateKey: string;
    clusterKey: string;
  }[] = [];
  const duplicates: CandidateDuplicateWarning[] = [];
  const seenDuplicateKeys = new Set<string>();
  const seenClusterKeys = new Set<string>();

  for (const file of files) {
    try {
      if (file.size > resumeUploadConfig.maxResumeFileSizeBytes) {
        throw new Error(`File exceeds ${resumeUploadConfig.maxResumeFileSizeLabel} limit.`);
      }

      if (!isAllowedResumeUpload(file.name, file.type)) {
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
        resumeText: parsed.text,
      });

      if (seenDuplicateKeys.has(duplicateKey)) {
        duplicates.push({
          type: "exact_duplicate",
          source: "upload_batch",
          candidateName,
          fileName: file.name,
          duplicateKey,
          clusterKey,
          message: "Skipped duplicate resume upload in the same batch.",
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
          message: "Candidate is clustered with another resume in the same upload batch.",
        });
      }

      seenDuplicateKeys.add(duplicateKey);
      seenClusterKeys.add(clusterKey);

      let stored;
      try {
        stored = await storeResumeFile({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          bytes: parsed.bytes,
        });
      } catch (storageError) {
        const message = storageError instanceof Error ? storageError.message : "Storage upload failed.";
        await recordAdminAlert({
          source: "storage",
          severity: "warning",
          message: `Resume storage failed for ${file.name}: ${message}`,
          details: { fileName: file.name, actor: user.email },
        }).catch((alertError) => {
          console.error("Unable to record storage alert", alertError);
        });
        throw storageError;
      }
      const candidate = analyzeCandidateResume({
        fileName: file.name,
        resumeText: parsed.text,
        storageUrl: stored.url,
      });
      candidates.push(candidate);
      uploadOutputs.push({ candidate, resumeText: parsed.text, duplicateKey, clusterKey });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown parsing failure";
      failures.push({
        fileName: file.name,
        error: reason,
      });
      if (
        reason !== `File exceeds ${resumeUploadConfig.maxResumeFileSizeLabel} limit.` &&
        reason !== "Only PDF, DOCX, or TXT resumes are supported."
      ) {
        await recordAdminAlert({
          source: "upload",
          severity: "warning",
          message: `Resume parsing failed for ${file.name}: ${reason}`,
          details: { fileName: file.name, actor: user.email },
        }).catch((alertError) => {
          console.error("Unable to record upload alert", alertError);
        });
      }
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
          candidateLabel: candidate.candidateName,
        });
      } catch {
        candidate.aiInsight = null;
      }
    }
  }

  if (!candidates.length) {
    return NextResponse.json({ candidates, duplicates, failures });
  }

  let persistError: string | undefined;
  let responseCandidates = candidates;

  try {
    const saved = await saveCandidateBatch({
      actor: user.email,
      actorRole: user.role,
      actorName: user.name,
      uploads: uploadOutputs,
    });
    responseCandidates = saved.candidates;
    duplicates.push(...saved.duplicates);

    const savedCandidateIds = new Set(saved.candidates.map((candidate) => candidate.id));

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
          recordAudit: false,
        });
      }
    }
  } catch (error) {
    persistError =
      error instanceof Error ? error.message : "Failed to save resumes.";
    await recordAdminAlert({
      source: "database",
      severity: "critical",
      message: `Resume persistence failed: ${persistError}`,
      details: { actor: user.email, candidateCount: candidates.length },
    }).catch((alertError) => {
      console.error("Unable to record database alert", alertError);
    });
  }

  const body: {
    candidates: CandidateAnalysis[];
    duplicates: CandidateDuplicateWarning[];
    failures: typeof failures;
    persistError?: string;
  } = {
    candidates: responseCandidates,
    duplicates,
    failures,
  };

  if (persistError) {
    body.persistError = persistError;
  }

    return NextResponse.json(body);
  } catch (error) {
    return serverErrorResponse(error);
  }
}
