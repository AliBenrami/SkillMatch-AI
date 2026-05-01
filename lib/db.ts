import { neon } from "@neondatabase/serverless";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { analyses, auditEvents, candidateRecommendations } from "@/db/schema";
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

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
  createdAt: string;
};

function getDb() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  return drizzle(neon(process.env.DATABASE_URL));
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

  const db = getDb();
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
  const db = getDb();

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
  const db = getDb();

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
  const db = getDb();

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
  const db = getDb();

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
  const db = getDb();
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
