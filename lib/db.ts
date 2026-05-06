import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { adminAlerts, analyses, auditEvents, candidateRecommendations, savedTargetRoles } from "@/db/schema";
import {
  GENESIS_PREVIOUS_HASH,
  computeAuditEventHash,
  verifyAuditChain,
  type AuditChainEvent,
} from "./audit-integrity";
import { getDatabase } from "./database";
import { matchingConfig } from "./seed-data";
import { deleteResumeObject } from "./storage";
import type { CandidateAnalysis, CandidatePositionRecommendation, SkillMatchResult } from "./skillmatch";

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

function normalizeCandidateRecommendation(candidate: CandidateAnalysis): CandidateAnalysis {
  return {
    ...candidate,
    assignedLearningModules: candidate.assignedLearningModules ?? [],
    topPositions: candidate.topPositions.map((position) => {
      const details = position.explanationDetails as Partial<CandidatePositionRecommendation["explanationDetails"]> | undefined;
      return {
        ...position,
        explanationDetails: {
          ...details,
          weights: details?.weights ?? matchingConfig.scoringWeights,
          earnedWeight: details?.earnedWeight ?? 0,
          possibleWeight: details?.possibleWeight ?? 0,
          requiredSkills: details?.requiredSkills ?? { matched: 0, total: 0, missing: [] },
          preferredSkills: details?.preferredSkills ?? { matched: 0, total: 0, missing: [] },
          softSkills: details?.softSkills ?? { matched: 0, total: 0, missing: [] },
          certifications: details?.certifications ?? { matched: 0, total: 0, matchedItems: [], missing: [] },
          experience: details?.experience ?? {
            candidateYears: position.structured.yearsExperience,
            minimumYears: position.role.minimumYearsExperience,
            idealYears: position.role.idealYearsExperience,
            earnedWeight: 0,
            meetsMinimum:
              position.structured.yearsExperience !== null &&
              position.structured.yearsExperience >= position.role.minimumYearsExperience,
            meetsIdeal:
              position.structured.yearsExperience !== null &&
              position.structured.yearsExperience >= position.role.idealYearsExperience
          },
          evidence: details?.evidence ?? [],
          rankingFactors: details?.rankingFactors ?? []
        }
      };
    })
  };
}

const memoryStore: AnalysisRecord[] = [];
const memoryCandidates: CandidateAnalysis[] = [];
const memoryCandidateUploads: CandidateUploadRecord[] = [];
const memoryAuditEvents: AuditEvent[] = [];
const memorySavedTargetRoles: SavedTargetRole[] = [];
const memoryAdminAlerts: AdminAlert[] = [];

/** Clears in-memory persistence when no DATABASE_URL backend is active (Playwright uses this between tests). */
export function resetMemoryStoresForE2e(): boolean {
  if (getDatabase()) {
    return false;
  }
  memoryStore.length = 0;
  memoryCandidates.length = 0;
  memoryCandidateUploads.length = 0;
  memoryAuditEvents.length = 0;
  memorySavedTargetRoles.length = 0;
  memoryAdminAlerts.length = 0;
  return true;
}

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
  actorRole?: string | null;
  actorName?: string | null;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
  createdAt: string;
};

export type AuditEventFilters = {
  action?: string;
  actor?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type AdminAlertSeverity = "info" | "warning" | "critical";
export type AdminAlertStatus = "open" | "resolved";

export type AdminAlert = {
  id: string;
  source: string;
  severity: AdminAlertSeverity;
  status: AdminAlertStatus;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
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
  auditActorRole?: string | null;
  auditActorName?: string | null;
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
    await appendAuditEvent({
      actor: auditActor,
      actorRole: input.auditActorRole ?? null,
      actorName: input.auditActorName ?? null,
      action: "recommendation_generation",
      entityId: record.id,
      details: { targetRole: input.result.role.title, score: input.result.score },
    });
  }

  return record;
}

async function getMostRecentAuditHash(): Promise<string> {
  const db = getDatabase();
  if (!db) {
    return memoryAuditEvents[0]?.hash ?? GENESIS_PREVIOUS_HASH;
  }

  const rows = await db
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(1);

  return rows[0]?.hash ?? GENESIS_PREVIOUS_HASH;
}

export async function appendAuditEvent(input: {
  actor: string;
  actorRole?: string | null;
  actorName?: string | null;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
}) {
  const createdAt = new Date().toISOString();
  const previousHash = await getMostRecentAuditHash();
  const hash = computeAuditEventHash({
    previousHash,
    actor: input.actor,
    actorRole: input.actorRole ?? null,
    actorName: input.actorName ?? null,
    action: input.action,
    entityId: input.entityId ?? null,
    details: input.details,
    createdAt,
  });

  const event: AuditEvent = {
    id: crypto.randomUUID(),
    actor: input.actor,
    actorRole: input.actorRole ?? null,
    actorName: input.actorName ?? null,
    action: input.action,
    entityId: input.entityId,
    details: input.details,
    previousHash,
    hash,
    createdAt,
  };
  const db = getDatabase();

  if (!db) {
    memoryAuditEvents.unshift(event);
    return event;
  }

  await db.insert(auditEvents).values({
    actor: input.actor,
    actorRole: input.actorRole ?? null,
    actorName: input.actorName ?? null,
    action: input.action,
    entityId: input.entityId ?? null,
    details: input.details,
    previousHash,
    hash,
  });

  return event;
}

export async function saveCandidateBatch(input: {
  actor: string;
  actorRole?: string | null;
  actorName?: string | null;
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
      actorRole: input.actorRole ?? null,
      actorName: input.actorName ?? null,
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
      aiInsight: upload.candidate.aiInsight,
      assignedLearningModules: upload.candidate.assignedLearningModules,
      bestRoleTitle: best?.role.title ?? "No match",
      bestScore: best?.score ?? 0
    });
  }

  await appendAuditEvent({
    actor: input.actor,
    actorRole: input.actorRole ?? null,
    actorName: input.actorName ?? null,
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
    return filterCandidateRecommendations(memoryCandidates.map(normalizeCandidateRecommendation), filters).slice(0, 20);
  }

  const rows = await db
    .select({
      id: candidateRecommendations.id,
      candidateName: candidateRecommendations.candidateName,
      fileName: candidateRecommendations.fileName,
      storageUrl: candidateRecommendations.storageUrl,
      structured: candidateRecommendations.structuredResume,
      topPositions: candidateRecommendations.topPositions,
      aiInsight: candidateRecommendations.aiInsight,
      assignedLearningModules: candidateRecommendations.assignedLearningModules,
      createdAt: candidateRecommendations.createdAt
    })
    .from(candidateRecommendations)
    .orderBy(desc(candidateRecommendations.createdAt))
    .limit(100);

  const candidates = rows.map((row) => normalizeCandidateRecommendation({
    id: row.id,
    candidateName: row.candidateName,
    fileName: row.fileName,
    storageUrl: row.storageUrl,
    structured: row.structured as CandidateAnalysis["structured"],
    topPositions: row.topPositions as CandidateAnalysis["topPositions"],
    aiInsight: (row.aiInsight ?? null) as CandidateAnalysis["aiInsight"],
    assignedLearningModules: row.assignedLearningModules as string[],
    createdAt: row.createdAt.toISOString()
  } as CandidateAnalysis));

  return filterCandidateRecommendations(candidates, filters).slice(0, 20);
}

export async function assignCandidateLearningModules(input: {
  actor: string;
  actorRole?: string | null;
  actorName?: string | null;
  candidateId: string;
  moduleIds: string[];
}) {
  const assignedLearningModules = Array.from(new Set(input.moduleIds.map((id) => id.trim()).filter(Boolean)));
  const db = getDatabase();

  if (!db) {
    const candidate = memoryCandidates.find((item) => item.id === input.candidateId);
    if (!candidate) {
      return null;
    }
    candidate.assignedLearningModules = assignedLearningModules;
    const upload = memoryCandidateUploads.find((item) => item.candidate.id === input.candidateId);
    if (upload) {
      upload.candidate.assignedLearningModules = assignedLearningModules;
    }
    await appendAuditEvent({
      actor: input.actor,
      actorRole: input.actorRole ?? null,
      actorName: input.actorName ?? null,
      action: "learning_modules_assigned",
      entityId: input.candidateId,
      details: { moduleIds: assignedLearningModules, mode: "local_memory" }
    });
    return normalizeCandidateRecommendation(candidate);
  }

  const rows = await db
    .select({
      id: candidateRecommendations.id,
      candidateName: candidateRecommendations.candidateName,
      fileName: candidateRecommendations.fileName,
      storageUrl: candidateRecommendations.storageUrl,
      structured: candidateRecommendations.structuredResume,
      topPositions: candidateRecommendations.topPositions,
      aiInsight: candidateRecommendations.aiInsight,
      assignedLearningModules: candidateRecommendations.assignedLearningModules,
      createdAt: candidateRecommendations.createdAt
    })
    .from(candidateRecommendations)
    .where(eq(candidateRecommendations.id, input.candidateId))
    .limit(1);

  if (!rows.length) {
    return null;
  }

  await db
    .update(candidateRecommendations)
    .set({ assignedLearningModules })
    .where(eq(candidateRecommendations.id, input.candidateId));

  await appendAuditEvent({
    actor: input.actor,
    actorRole: input.actorRole ?? null,
    actorName: input.actorName ?? null,
    action: "learning_modules_assigned",
    entityId: input.candidateId,
    details: { moduleIds: assignedLearningModules, mode: "database" }
  });

  const row = rows[0];
  return normalizeCandidateRecommendation({
    id: row.id,
    candidateName: row.candidateName,
    fileName: row.fileName,
    storageUrl: row.storageUrl,
    structured: row.structured as CandidateAnalysis["structured"],
    topPositions: row.topPositions as CandidateAnalysis["topPositions"],
    aiInsight: (row.aiInsight ?? null) as CandidateAnalysis["aiInsight"],
    assignedLearningModules,
    createdAt: row.createdAt.toISOString()
  } as CandidateAnalysis);
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

export async function deleteCandidateRecommendation(input: {
  actor: string;
  actorRole?: string | null;
  actorName?: string | null;
  candidateId: string;
}) {
  const db = getDatabase();

  if (!db) {
    const index = memoryCandidates.findIndex((item) => item.id === input.candidateId);
    if (index === -1) {
      return null;
    }

    const [candidate] = memoryCandidates.splice(index, 1);
    const uploadIndex = memoryCandidateUploads.findIndex((item) => item.candidate.id === input.candidateId);
    if (uploadIndex >= 0) {
      memoryCandidateUploads.splice(uploadIndex, 1);
    }

    const objectDeletion = await deleteResumeObject(candidate.storageUrl);
    await appendAuditEvent({
      actor: input.actor,
      actorRole: input.actorRole ?? null,
      actorName: input.actorName ?? null,
      action: "candidate_resume_deleted",
      entityId: candidate.id,
      details: {
        candidateName: candidate.candidateName,
        fileName: candidate.fileName,
        storageUrl: candidate.storageUrl,
        resumeObjectDeleted: objectDeletion.deleted,
        resumeObjectDeletionSupported: objectDeletion.supported,
        resumeObjectDeletionError: objectDeletion.error,
        mode: "local_memory",
      },
    });

    return {
      candidateId: candidate.id,
      candidateName: candidate.candidateName,
      fileName: candidate.fileName,
      storageUrl: candidate.storageUrl,
      resumeObjectDeleted: objectDeletion.deleted,
      resumeObjectDeletionSupported: objectDeletion.supported,
      resumeObjectDeletionError: objectDeletion.error,
      mode: "local_memory" as const,
    };
  }

  const rows = await db
    .select({
      id: candidateRecommendations.id,
      candidateName: candidateRecommendations.candidateName,
      fileName: candidateRecommendations.fileName,
      storageUrl: candidateRecommendations.storageUrl,
    })
    .from(candidateRecommendations)
    .where(eq(candidateRecommendations.id, input.candidateId))
    .limit(1);

  if (!rows.length) {
    return null;
  }

  const candidate = rows[0];
  await db.delete(candidateRecommendations).where(eq(candidateRecommendations.id, input.candidateId));

  const objectDeletion = await deleteResumeObject(candidate.storageUrl);
  await appendAuditEvent({
    actor: input.actor,
    actorRole: input.actorRole ?? null,
    actorName: input.actorName ?? null,
    action: "candidate_resume_deleted",
    entityId: candidate.id,
    details: {
      candidateName: candidate.candidateName,
      fileName: candidate.fileName,
      storageUrl: candidate.storageUrl,
      resumeObjectDeleted: objectDeletion.deleted,
      resumeObjectDeletionSupported: objectDeletion.supported,
      resumeObjectDeletionError: objectDeletion.error,
      mode: "database",
    },
  });

  return {
    candidateId: candidate.id,
    candidateName: candidate.candidateName,
    fileName: candidate.fileName,
    storageUrl: candidate.storageUrl,
    resumeObjectDeleted: objectDeletion.deleted,
    resumeObjectDeletionSupported: objectDeletion.supported,
    resumeObjectDeletionError: objectDeletion.error,
    mode: "database" as const,
  };
}

function applyAuditFiltersInMemory(events: AuditEvent[], filters: AuditEventFilters) {
  return events.filter((event) => {
    if (filters.action && filters.action.trim() && event.action !== filters.action.trim()) {
      return false;
    }
    if (filters.actor && filters.actor.trim()) {
      const needle = filters.actor.trim().toLowerCase();
      if (!event.actor.toLowerCase().includes(needle)) {
        return false;
      }
    }
    if (filters.entityId && filters.entityId.trim() && event.entityId !== filters.entityId.trim()) {
      return false;
    }
    if (filters.startDate) {
      if (new Date(event.createdAt).getTime() < new Date(filters.startDate).getTime()) {
        return false;
      }
    }
    if (filters.endDate) {
      if (new Date(event.createdAt).getTime() > new Date(filters.endDate).getTime()) {
        return false;
      }
    }
    return true;
  });
}

export async function listAuditEvents(filters: AuditEventFilters = {}) {
  const limit = Math.max(1, Math.min(200, filters.limit ?? 50));
  const db = getDatabase();

  if (!db) {
    return applyAuditFiltersInMemory(memoryAuditEvents, filters).slice(0, limit);
  }

  const conditions = [] as ReturnType<typeof eq>[];
  if (filters.action && filters.action.trim()) {
    conditions.push(eq(auditEvents.action, filters.action.trim()));
  }
  if (filters.actor && filters.actor.trim()) {
    conditions.push(sql`lower(${auditEvents.actor}) like ${`%${filters.actor.trim().toLowerCase()}%`}` as ReturnType<typeof eq>);
  }
  if (filters.entityId && filters.entityId.trim()) {
    conditions.push(eq(auditEvents.entityId, filters.entityId.trim()));
  }
  if (filters.startDate) {
    conditions.push(gte(auditEvents.createdAt, new Date(filters.startDate)));
  }
  if (filters.endDate) {
    conditions.push(lte(auditEvents.createdAt, new Date(filters.endDate)));
  }

  const baseQuery = db
    .select({
      id: auditEvents.id,
      actor: auditEvents.actor,
      actorRole: auditEvents.actorRole,
      actorName: auditEvents.actorName,
      action: auditEvents.action,
      entityId: auditEvents.entityId,
      details: auditEvents.details,
      previousHash: auditEvents.previousHash,
      hash: auditEvents.hash,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents);

  const filtered = conditions.length ? baseQuery.where(and(...conditions)) : baseQuery;
  const rows = await filtered.orderBy(desc(auditEvents.createdAt)).limit(limit);

  return rows.map((row) => ({
    id: String(row.id),
    actor: row.actor,
    actorRole: row.actorRole ?? null,
    actorName: row.actorName ?? null,
    action: row.action,
    entityId: row.entityId ?? undefined,
    details: row.details,
    previousHash: row.previousHash ?? GENESIS_PREVIOUS_HASH,
    hash: row.hash ?? "",
    createdAt: row.createdAt.toISOString(),
  })) satisfies AuditEvent[];
}

/**
 * Re-derives the audit hash chain in chronological order to prove no event was
 * dropped, edited, or reordered. Returns ok=true when the recomputed hash for
 * each event matches what was persisted and each previous_hash points at the
 * row immediately before it.
 */
export async function verifyAuditIntegrity() {
  const db = getDatabase();
  let chain: AuditChainEvent[] = [];

  if (!db) {
    chain = [...memoryAuditEvents]
      .reverse()
      .map((event) => ({
        previousHash: event.previousHash,
        actor: event.actor,
        actorRole: event.actorRole ?? null,
        actorName: event.actorName ?? null,
        action: event.action,
        entityId: event.entityId ?? null,
        details: event.details,
        createdAt: event.createdAt,
        hash: event.hash,
      }));
  } else {
    const rows = await db
      .select({
        actor: auditEvents.actor,
        actorRole: auditEvents.actorRole,
        actorName: auditEvents.actorName,
        action: auditEvents.action,
        entityId: auditEvents.entityId,
        details: auditEvents.details,
        previousHash: auditEvents.previousHash,
        hash: auditEvents.hash,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));

    chain = rows.map((row) => ({
      previousHash: row.previousHash ?? GENESIS_PREVIOUS_HASH,
      actor: row.actor,
      actorRole: row.actorRole ?? null,
      actorName: row.actorName ?? null,
      action: row.action,
      entityId: row.entityId ?? null,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
      hash: row.hash ?? "",
    }));
  }

  return verifyAuditChain(chain);
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

export function resetAuditEventsForTests() {
  memoryAuditEvents.length = 0;
}

export function resetAdminAlertsForTests() {
  memoryAdminAlerts.length = 0;
}

export type AdminAlertInput = {
  source: string;
  severity: AdminAlertSeverity;
  message: string;
  details?: Record<string, unknown>;
};

export async function recordAdminAlert(input: AdminAlertInput): Promise<AdminAlert> {
  const alert: AdminAlert = {
    id: crypto.randomUUID(),
    source: input.source,
    severity: input.severity,
    status: "open",
    message: input.message,
    details: input.details ?? {},
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
  };

  const db = getDatabase();
  if (!db) {
    memoryAdminAlerts.unshift(alert);
    return alert;
  }

  await db.insert(adminAlerts).values({
    id: alert.id,
    source: alert.source,
    severity: alert.severity,
    status: alert.status,
    message: alert.message,
    details: alert.details,
  });

  return alert;
}

export type AdminAlertListFilters = {
  status?: AdminAlertStatus;
  limit?: number;
};

export async function listAdminAlerts(filters: AdminAlertListFilters = {}): Promise<AdminAlert[]> {
  const limit = Math.max(1, Math.min(200, filters.limit ?? 50));
  const db = getDatabase();
  if (!db) {
    return memoryAdminAlerts
      .filter((alert) => (filters.status ? alert.status === filters.status : true))
      .slice(0, limit);
  }

  const baseQuery = db
    .select({
      id: adminAlerts.id,
      source: adminAlerts.source,
      severity: adminAlerts.severity,
      status: adminAlerts.status,
      message: adminAlerts.message,
      details: adminAlerts.details,
      createdAt: adminAlerts.createdAt,
      resolvedAt: adminAlerts.resolvedAt,
      resolvedBy: adminAlerts.resolvedBy,
    })
    .from(adminAlerts);

  const filteredQuery = filters.status
    ? baseQuery.where(eq(adminAlerts.status, filters.status))
    : baseQuery;
  const rows = await filteredQuery.orderBy(desc(adminAlerts.createdAt)).limit(limit);

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    severity: row.severity as AdminAlertSeverity,
    status: row.status as AdminAlertStatus,
    message: row.message,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedBy: row.resolvedBy ?? null,
  }));
}

export async function resolveAdminAlert(input: { id: string; resolvedBy: string }): Promise<AdminAlert | null> {
  const db = getDatabase();
  const resolvedAt = new Date().toISOString();

  if (!db) {
    const index = memoryAdminAlerts.findIndex((alert) => alert.id === input.id);
    if (index === -1) {
      return null;
    }
    if (memoryAdminAlerts[index].status === "resolved") {
      return memoryAdminAlerts[index];
    }
    memoryAdminAlerts[index] = {
      ...memoryAdminAlerts[index],
      status: "resolved",
      resolvedAt,
      resolvedBy: input.resolvedBy,
    };
    return memoryAdminAlerts[index];
  }

  await db
    .update(adminAlerts)
    .set({ status: "resolved", resolvedAt: new Date(resolvedAt), resolvedBy: input.resolvedBy })
    .where(eq(adminAlerts.id, input.id));

  const rows = await db
    .select({
      id: adminAlerts.id,
      source: adminAlerts.source,
      severity: adminAlerts.severity,
      status: adminAlerts.status,
      message: adminAlerts.message,
      details: adminAlerts.details,
      createdAt: adminAlerts.createdAt,
      resolvedAt: adminAlerts.resolvedAt,
      resolvedBy: adminAlerts.resolvedBy,
    })
    .from(adminAlerts)
    .where(eq(adminAlerts.id, input.id))
    .limit(1);

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    source: row.source,
    severity: row.severity as AdminAlertSeverity,
    status: row.status as AdminAlertStatus,
    message: row.message,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedBy: row.resolvedBy ?? null,
  };
}
