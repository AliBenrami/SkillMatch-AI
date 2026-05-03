import { and, desc, eq } from "drizzle-orm";
import { analyses, auditEvents, candidateRecommendations, savedTargetRoles } from "@/db/schema";
import { getDatabase } from "./database";
import type { CandidateAnalysis, SkillMatchResult } from "./skillmatch";

export type AnalysisRecord = {
  id: string;
  employeeName: string;
  targetRole: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  createdAt: string;
};

export type CandidateRecommendationFilters = {
  skills?: string[];
  education?: string;
  location?: string;
  minYearsExperience?: number;
};

export type CandidateDuplicateWarning = {
  type: "exact_duplicate" | "candidate_cluster";
  source: "upload_batch" | "existing_records";
  candidateName: string;
  fileName: string;
  duplicateKey: string;
  clusterKey: string;
  matchedCandidateId?: string;
  matchedFileName?: string;
  message: string;
};

export type CandidateUploadRecord = {
  candidate: CandidateAnalysis;
  resumeText: string;
  duplicateKey: string;
  clusterKey: string;
};

const memoryStore: AnalysisRecord[] = [];
const memoryCandidates: CandidateAnalysis[] = [];
const memoryCandidateUploads: CandidateUploadRecord[] = [];
const memoryAuditEvents: AuditEvent[] = [];
const memorySavedTargetRoles: SavedTargetRole[] = [];

function normalizeFilterValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDuplicateValue(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashDuplicateValue(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildCandidateDuplicateIdentity(input: {
  candidateName: string;
  fileName: string;
  resumeText: string;
}) {
  const candidateKey = normalizeDuplicateValue(input.candidateName) || "candidate";
  const fileKey = normalizeDuplicateValue(input.fileName) || "file";
  const resumeKey = normalizeDuplicateValue(input.resumeText);
  const duplicateKey = `${candidateKey}:${hashDuplicateValue(resumeKey)}`;
  const clusterKey = `${candidateKey}:${fileKey}`;

  return { duplicateKey, clusterKey };
}

function createDuplicateWarning(
  input: Omit<CandidateDuplicateWarning, "message"> & {
    message?: string;
  }
): CandidateDuplicateWarning {
  return {
    ...input,
    message:
      input.message ??
      (input.type === "exact_duplicate"
        ? "Skipped duplicate resume upload."
        : "Uploaded candidate is clustered with an existing candidate record.")
  };
}

export function filterCandidateRecommendations(
  candidates: CandidateAnalysis[],
  filters: CandidateRecommendationFilters = {}
) {
  const requiredSkills = (filters.skills ?? []).map(normalizeFilterValue).filter(Boolean);
  const education = filters.education ? normalizeFilterValue(filters.education) : "";
  const location = filters.location ? normalizeFilterValue(filters.location) : "";
  const minYearsExperience = filters.minYearsExperience;

  return candidates.filter((candidate) => {
    const structured = candidate.structured;
    const candidateSkills = new Set(structured.skills.map(normalizeFilterValue));
    const candidateEducation = structured.education.map(normalizeFilterValue);
    const candidateLocation = structured.location ? normalizeFilterValue(structured.location) : "";

    return (
      requiredSkills.every((skill) => candidateSkills.has(skill)) &&
      (!education || candidateEducation.some((item) => item.includes(education))) &&
      (!location || candidateLocation.includes(location)) &&
      (minYearsExperience === undefined ||
        (structured.yearsExperience !== null && structured.yearsExperience >= minYearsExperience))
    );
  });
}

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type SavedTargetRole = {
  id: string;
  employeeEmail: string;
  roleId: string;
  roleTitle: string;
  targetScore: number;
  currentScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
};

function clampScore(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function calculateProgress(currentScore: number | null, targetScore: number) {
  if (currentScore === null) {
    return 0;
  }

  return clampScore((currentScore / targetScore) * 100, 0, 100);
}

export async function saveAnalysis(input: {
  employeeName: string;
  resumeText: string;
  result: SkillMatchResult;
  recordAudit?: boolean;
  auditActor?: string;
}) {
  const recordAudit = input.recordAudit !== false;
  const auditActor = input.auditActor ?? input.employeeName;
  const record: AnalysisRecord = {
    id: crypto.randomUUID(),
    employeeName: input.employeeName,
    targetRole: input.result.role.title,
    score: input.result.score,
    matchedSkills: input.result.matchedSkills,
    missingSkills: input.result.missingSkills.map((item) => item.skill),
    createdAt: new Date().toISOString()
  };

  const db = getDatabase();
  if (!db) {
    memoryStore.unshift(record);
    return record;
  }

  await db.insert(analyses).values({
    id: record.id,
    employeeName: input.employeeName,
    targetRoleId: input.result.role.id,
    targetRoleTitle: input.result.role.title,
    resumeText: input.resumeText,
    score: input.result.score,
    matchedSkills: input.result.matchedSkills,
    missingSkills: record.missingSkills,
    explanation: input.result.explanation
  });

  if (recordAudit) {
    await db.insert(auditEvents).values({
      actor: auditActor,
      action: "recommendation_generation",
      entityId: record.id,
      details: { targetRole: input.result.role.title, score: input.result.score }
    });
  }

  return record;
}

export async function appendAuditEvent(input: {
  actor: string;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
}) {
  const event: AuditEvent = {
    id: crypto.randomUUID(),
    actor: input.actor,
    action: input.action,
    entityId: input.entityId,
    details: input.details,
    createdAt: new Date().toISOString()
  };
  const db = getDatabase();

  if (!db) {
    memoryAuditEvents.unshift(event);
    return event;
  }

  await db.insert(auditEvents).values({
    actor: input.actor,
    action: input.action,
    entityId: input.entityId ?? null,
    details: input.details
  });

  return event;
}

export async function saveCandidateBatch(input: {
  actor: string;
  uploads: CandidateUploadRecord[];
}) {
  const db = getDatabase();
  const seenDuplicateKeys = new Set<string>();
  const savedUploads: CandidateUploadRecord[] = [];
  const duplicates: CandidateDuplicateWarning[] = [];

  if (!db) {
    for (const upload of input.uploads) {
      const batchDuplicate = seenDuplicateKeys.has(upload.duplicateKey);
      if (batchDuplicate) {
        duplicates.push(
          createDuplicateWarning({
            type: "exact_duplicate",
            source: "upload_batch",
            candidateName: upload.candidate.candidateName,
            fileName: upload.candidate.fileName,
            duplicateKey: upload.duplicateKey,
            clusterKey: upload.clusterKey
          })
        );
        continue;
      }

      seenDuplicateKeys.add(upload.duplicateKey);

      const existingDuplicate = memoryCandidateUploads.find((item) => item.duplicateKey === upload.duplicateKey);
      if (existingDuplicate) {
        duplicates.push(
          createDuplicateWarning({
            type: "exact_duplicate",
            source: "existing_records",
            candidateName: upload.candidate.candidateName,
            fileName: upload.candidate.fileName,
            duplicateKey: upload.duplicateKey,
            clusterKey: upload.clusterKey,
            matchedCandidateId: existingDuplicate.candidate.id,
            matchedFileName: existingDuplicate.candidate.fileName
          })
        );
        continue;
      }

      const existingCluster = memoryCandidateUploads.find((item) => item.clusterKey === upload.clusterKey);
      if (existingCluster) {
        duplicates.push(
          createDuplicateWarning({
            type: "candidate_cluster",
            source: "existing_records",
            candidateName: upload.candidate.candidateName,
            fileName: upload.candidate.fileName,
            duplicateKey: upload.duplicateKey,
            clusterKey: upload.clusterKey,
            matchedCandidateId: existingCluster.candidate.id,
            matchedFileName: existingCluster.candidate.fileName
          })
        );
      }

      savedUploads.push(upload);
    }

    memoryCandidateUploads.unshift(...savedUploads);
    memoryCandidates.unshift(...savedUploads.map((upload) => upload.candidate));
    await appendAuditEvent({
      actor: input.actor,
      action: "recommendation_generation",
      details: { count: savedUploads.length, duplicates: duplicates.length, mode: "local_memory" }
    });
    return {
      candidates: savedUploads.map((upload) => upload.candidate),
      duplicates
    };
  }

  for (const upload of input.uploads) {
    const batchDuplicate = seenDuplicateKeys.has(upload.duplicateKey);
    if (batchDuplicate) {
      duplicates.push(
        createDuplicateWarning({
          type: "exact_duplicate",
          source: "upload_batch",
          candidateName: upload.candidate.candidateName,
          fileName: upload.candidate.fileName,
          duplicateKey: upload.duplicateKey,
          clusterKey: upload.clusterKey
        })
      );
      continue;
    }

    seenDuplicateKeys.add(upload.duplicateKey);

    const existingAnalyses = await db
      .select({
        id: analyses.id,
        employeeName: analyses.employeeName,
        resumeText: analyses.resumeText
      })
      .from(analyses)
      .where(eq(analyses.employeeName, upload.candidate.candidateName))
      .orderBy(desc(analyses.createdAt))
      .limit(20);

    const matchedAnalysis = existingAnalyses.find((row) => {
      const identity = buildCandidateDuplicateIdentity({
        candidateName: row.employeeName,
        fileName: upload.candidate.fileName,
        resumeText: row.resumeText
      });
      return identity.duplicateKey === upload.duplicateKey;
    });

    if (matchedAnalysis) {
      duplicates.push(
        createDuplicateWarning({
          type: "exact_duplicate",
          source: "existing_records",
          candidateName: upload.candidate.candidateName,
          fileName: upload.candidate.fileName,
          duplicateKey: upload.duplicateKey,
          clusterKey: upload.clusterKey,
          matchedCandidateId: matchedAnalysis.id
        })
      );
      continue;
    }

    const clusterCandidates = await db
      .select({
        id: candidateRecommendations.id,
        fileName: candidateRecommendations.fileName
      })
      .from(candidateRecommendations)
      .where(eq(candidateRecommendations.candidateName, upload.candidate.candidateName))
      .orderBy(desc(candidateRecommendations.createdAt))
      .limit(5);

    if (clusterCandidates.length) {
      duplicates.push(
        createDuplicateWarning({
          type: "candidate_cluster",
          source: "existing_records",
          candidateName: upload.candidate.candidateName,
          fileName: upload.candidate.fileName,
          duplicateKey: upload.duplicateKey,
          clusterKey: upload.clusterKey,
          matchedCandidateId: clusterCandidates[0].id,
          matchedFileName: clusterCandidates[0].fileName
        })
      );
    }

    savedUploads.push(upload);
  }

  for (const upload of savedUploads) {
    const best = upload.candidate.topPositions[0];
    await db.insert(candidateRecommendations).values({
      id: upload.candidate.id,
      candidateName: upload.candidate.candidateName,
      fileName: upload.candidate.fileName,
      storageUrl: upload.candidate.storageUrl,
      structuredResume: upload.candidate.structured,
      topPositions: upload.candidate.topPositions,
      bestRoleTitle: best?.role.title ?? "No match",
      bestScore: best?.score ?? 0
    });
  }

  await appendAuditEvent({
    actor: input.actor,
    action: "recommendation_generation",
    details: { count: savedUploads.length, duplicates: duplicates.length, mode: "database" }
  });

  return {
    candidates: savedUploads.map((upload) => upload.candidate),
    duplicates
  };
}

export async function listCandidateRecommendations(filters: CandidateRecommendationFilters = {}) {
  const db = getDatabase();

  if (!db) {
    return filterCandidateRecommendations(memoryCandidates, filters).slice(0, 20);
  }

  const rows = await db
    .select({
      id: candidateRecommendations.id,
      candidateName: candidateRecommendations.candidateName,
      fileName: candidateRecommendations.fileName,
      storageUrl: candidateRecommendations.storageUrl,
      structured: candidateRecommendations.structuredResume,
      topPositions: candidateRecommendations.topPositions,
      createdAt: candidateRecommendations.createdAt
    })
    .from(candidateRecommendations)
    .orderBy(desc(candidateRecommendations.createdAt))
    .limit(100);

  const candidates = rows.map((row) => ({
    id: row.id,
    candidateName: row.candidateName,
    fileName: row.fileName,
    storageUrl: row.storageUrl,
    structured: row.structured as CandidateAnalysis["structured"],
    topPositions: row.topPositions as CandidateAnalysis["topPositions"],
    createdAt: row.createdAt.toISOString()
  })) as CandidateAnalysis[];

  return filterCandidateRecommendations(candidates, filters).slice(0, 20);
}

export async function getCandidateResumeById(candidateId: string) {
  const db = getDatabase();

  if (!db) {
    const candidate = memoryCandidates.find((item) => item.id === candidateId);
    return candidate
      ? { fileName: candidate.fileName, storageUrl: candidate.storageUrl }
      : null;
  }

  const rows = await db
    .select({
      fileName: candidateRecommendations.fileName,
      storageUrl: candidateRecommendations.storageUrl
    })
    .from(candidateRecommendations)
    .where(eq(candidateRecommendations.id, candidateId))
    .limit(1);

  if (!rows.length) {
    return null;
  }

  return {
    fileName: rows[0].fileName,
    storageUrl: rows[0].storageUrl
  };
}

export async function listAuditEvents() {
  const db = getDatabase();

  if (!db) {
    return memoryAuditEvents.slice(0, 20);
  }

  const rows = await db
    .select({
      id: auditEvents.id,
      actor: auditEvents.actor,
      action: auditEvents.action,
      entityId: auditEvents.entityId,
      details: auditEvents.details,
      createdAt: auditEvents.createdAt
    })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);

  return rows.map((row) => ({
    id: String(row.id),
    actor: row.actor,
    action: row.action,
    entityId: row.entityId ?? undefined,
    details: row.details,
    createdAt: row.createdAt.toISOString()
  })) satisfies AuditEvent[];
}

export async function listAnalyses() {
  const db = getDatabase();
  if (!db) {
    return memoryStore.slice(0, 8);
  }

  const rows = await db
    .select({
      id: analyses.id,
      employeeName: analyses.employeeName,
      targetRole: analyses.targetRoleTitle,
      score: analyses.score,
      matchedSkills: analyses.matchedSkills,
      missingSkills: analyses.missingSkills,
      createdAt: analyses.createdAt
    })
    .from(analyses)
    .orderBy(desc(analyses.createdAt))
    .limit(8);

  return rows.map((row) => ({
    id: row.id,
    employeeName: row.employeeName,
    targetRole: row.targetRole,
    score: row.score,
    matchedSkills: row.matchedSkills,
    missingSkills: row.missingSkills,
    createdAt: row.createdAt.toISOString()
  })) satisfies AnalysisRecord[];
}

export async function listSavedTargetRoles(employeeEmail: string) {
  const db = getDatabase();
  if (!db) {
    return memorySavedTargetRoles
      .filter((role) => role.employeeEmail === employeeEmail)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const rows = await db
    .select({
      id: savedTargetRoles.id,
      employeeEmail: savedTargetRoles.employeeEmail,
      roleId: savedTargetRoles.roleId,
      roleTitle: savedTargetRoles.roleTitle,
      targetScore: savedTargetRoles.targetScore,
      currentScore: savedTargetRoles.currentScore,
      matchedSkills: savedTargetRoles.matchedSkills,
      missingSkills: savedTargetRoles.missingSkills,
      progressPercent: savedTargetRoles.progressPercent,
      createdAt: savedTargetRoles.createdAt,
      updatedAt: savedTargetRoles.updatedAt
    })
    .from(savedTargetRoles)
    .where(eq(savedTargetRoles.employeeEmail, employeeEmail))
    .orderBy(desc(savedTargetRoles.updatedAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  })) satisfies SavedTargetRole[];
}

export async function saveTargetRole(input: {
  employeeEmail: string;
  roleId: string;
  roleTitle: string;
  targetScore?: number;
  currentScore?: number | null;
  matchedSkills?: string[];
  missingSkills?: string[];
}) {
  const now = new Date().toISOString();
  const targetScore = clampScore(input.targetScore ?? 80, 1, 100);
  const currentScore = input.currentScore == null ? null : clampScore(input.currentScore, 0, 100);
  const progressPercent = calculateProgress(currentScore, targetScore);
  const existing = (await listSavedTargetRoles(input.employeeEmail)).find((role) => role.roleId === input.roleId);
  const record: SavedTargetRole = {
    id: existing?.id ?? crypto.randomUUID(),
    employeeEmail: input.employeeEmail,
    roleId: input.roleId,
    roleTitle: input.roleTitle,
    targetScore,
    currentScore,
    matchedSkills: input.matchedSkills ?? existing?.matchedSkills ?? [],
    missingSkills: input.missingSkills ?? existing?.missingSkills ?? [],
    progressPercent,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const db = getDatabase();
  if (!db) {
    const index = memorySavedTargetRoles.findIndex(
      (role) => role.employeeEmail === input.employeeEmail && role.roleId === input.roleId
    );
    if (index >= 0) {
      memorySavedTargetRoles[index] = record;
    } else {
      memorySavedTargetRoles.unshift(record);
    }
    return record;
  }

  if (existing) {
    await db
      .update(savedTargetRoles)
      .set({
        roleTitle: record.roleTitle,
        targetScore: record.targetScore,
        currentScore: record.currentScore,
        matchedSkills: record.matchedSkills,
        missingSkills: record.missingSkills,
        progressPercent: record.progressPercent,
        updatedAt: new Date()
      })
      .where(and(eq(savedTargetRoles.employeeEmail, input.employeeEmail), eq(savedTargetRoles.roleId, input.roleId)));
  } else {
    await db.insert(savedTargetRoles).values({
      id: record.id,
      employeeEmail: record.employeeEmail,
      roleId: record.roleId,
      roleTitle: record.roleTitle,
      targetScore: record.targetScore,
      currentScore: record.currentScore,
      matchedSkills: record.matchedSkills,
      missingSkills: record.missingSkills,
      progressPercent: record.progressPercent
    });
  }

  await appendAuditEvent({
    actor: input.employeeEmail,
    action: "saved_target_role_upsert",
    entityId: record.id,
    details: { roleId: input.roleId, roleTitle: input.roleTitle, progressPercent }
  });

  return record;
}

export async function deleteSavedTargetRole(input: { employeeEmail: string; id: string }) {
  const db = getDatabase();
  if (!db) {
    const index = memorySavedTargetRoles.findIndex(
      (role) => role.employeeEmail === input.employeeEmail && role.id === input.id
    );
    if (index === -1) {
      return false;
    }
    memorySavedTargetRoles.splice(index, 1);
    return true;
  }

  await db
    .delete(savedTargetRoles)
    .where(and(eq(savedTargetRoles.employeeEmail, input.employeeEmail), eq(savedTargetRoles.id, input.id)));
  return true;
}

export function resetSavedTargetRolesForTests() {
  memorySavedTargetRoles.length = 0;
}

export function resetCandidateRecommendationsForTests() {
  memoryCandidates.length = 0;
  memoryCandidateUploads.length = 0;
}

export function resetAnalysesForTests() {
  memoryStore.length = 0;
}
