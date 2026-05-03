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

const memoryStore: AnalysisRecord[] = [];
const memoryCandidates: CandidateAnalysis[] = [];
const memoryAuditEvents: AuditEvent[] = [];
const memorySavedTargetRoles: SavedTargetRole[] = [];

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
}) {
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

  await db.insert(auditEvents).values({
    actor: input.employeeName,
    action: "recommendation_generation",
    entityId: record.id,
    details: { targetRole: input.result.role.title, score: input.result.score }
  });

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
  candidates: CandidateAnalysis[];
}) {
  const db = getDatabase();

  if (!db) {
    memoryCandidates.unshift(...input.candidates);
    await appendAuditEvent({
      actor: input.actor,
      action: "recommendation_generation",
      details: { count: input.candidates.length, mode: "local_memory" }
    });
    return input.candidates;
  }

  for (const candidate of input.candidates) {
    const best = candidate.topPositions[0];
    await db.insert(candidateRecommendations).values({
      id: candidate.id,
      candidateName: candidate.candidateName,
      fileName: candidate.fileName,
      storageUrl: candidate.storageUrl,
      structuredResume: candidate.structured,
      topPositions: candidate.topPositions,
      bestRoleTitle: best?.role.title ?? "No match",
      bestScore: best?.score ?? 0
    });
  }

  await appendAuditEvent({
    actor: input.actor,
    action: "recommendation_generation",
    details: { count: input.candidates.length, mode: "database" }
  });

  return input.candidates;
}

export async function listCandidateRecommendations() {
  const db = getDatabase();

  if (!db) {
    return memoryCandidates.slice(0, 20);
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
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    candidateName: row.candidateName,
    fileName: row.fileName,
    storageUrl: row.storageUrl,
    structured: row.structured as CandidateAnalysis["structured"],
    topPositions: row.topPositions as CandidateAnalysis["topPositions"],
    createdAt: row.createdAt.toISOString()
  })) as CandidateAnalysis[];
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
