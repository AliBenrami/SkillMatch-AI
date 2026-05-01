import { neon } from "@neondatabase/serverless";
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

function getSql() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  return neon(process.env.DATABASE_URL);
}

function asJson<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
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

  const sql = getSql();
  if (!sql) {
    memoryStore.unshift(record);
    return record;
  }

  await sql`
    insert into analyses (
      id,
      employee_name,
      target_role_id,
      target_role_title,
      resume_text,
      score,
      matched_skills,
      missing_skills,
      explanation
    ) values (
      ${record.id},
      ${input.employeeName},
      ${input.result.role.id},
      ${input.result.role.title},
      ${input.resumeText},
      ${input.result.score},
      ${JSON.stringify(input.result.matchedSkills)}::jsonb,
      ${JSON.stringify(record.missingSkills)}::jsonb,
      ${input.result.explanation}
    )
  `;

  await sql`
    insert into audit_events (actor, action, entity_id, details)
    values (
      ${input.employeeName},
      'recommendation_generation',
      ${record.id},
      ${JSON.stringify({ targetRole: input.result.role.title, score: input.result.score })}::jsonb
    )
  `;

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
  const sql = getSql();

  if (!sql) {
    memoryAuditEvents.unshift(event);
    return event;
  }

  await sql`
    insert into audit_events (actor, action, entity_id, details)
    values (${input.actor}, ${input.action}, ${input.entityId ?? null}, ${JSON.stringify(input.details)}::jsonb)
  `;

  return event;
}

export async function saveCandidateBatch(input: {
  actor: string;
  candidates: CandidateAnalysis[];
}) {
  const sql = getSql();

  if (!sql) {
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
    await sql`
      insert into candidate_recommendations (
        id,
        candidate_name,
        file_name,
        storage_url,
        structured_resume,
        top_positions,
        best_role_title,
        best_score
      ) values (
        ${candidate.id},
        ${candidate.candidateName},
        ${candidate.fileName},
        ${candidate.storageUrl},
        ${JSON.stringify(candidate.structured)}::jsonb,
        ${JSON.stringify(candidate.topPositions)}::jsonb,
        ${best?.role.title ?? "No match"},
        ${best?.score ?? 0}
      )
    `;
  }

  await appendAuditEvent({
    actor: input.actor,
    action: "recommendation_generation",
    details: { count: input.candidates.length, mode: "database" }
  });

  return input.candidates;
}

export async function listCandidateRecommendations() {
  const sql = getSql();

  if (!sql) {
    return memoryCandidates.slice(0, 20);
  }

  const rows = await sql`
    select id, candidate_name, file_name, storage_url, structured_resume, top_positions, created_at
    from candidate_recommendations
    order by created_at desc
    limit 20
  `;

  return rows.map((row) => ({
    id: String(row.id),
    candidateName: String(row.candidate_name),
    fileName: String(row.file_name),
    storageUrl: String(row.storage_url),
    structured: asJson<CandidateAnalysis["structured"]>(row.structured_resume),
    topPositions: asJson<CandidateAnalysis["topPositions"]>(row.top_positions),
    createdAt: new Date(String(row.created_at)).toISOString()
  })) as CandidateAnalysis[];
}

export async function listAuditEvents() {
  const sql = getSql();

  if (!sql) {
    return memoryAuditEvents.slice(0, 20);
  }

  const rows = await sql`
    select id, actor, action, entity_id, details, created_at
    from audit_events
    order by created_at desc
    limit 20
  `;

  return rows.map((row) => ({
    id: String(row.id),
    actor: String(row.actor),
    action: String(row.action),
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    details: asJson<Record<string, unknown>>(row.details ?? {}),
    createdAt: new Date(String(row.created_at)).toISOString()
  })) satisfies AuditEvent[];
}

export async function listAnalyses() {
  const sql = getSql();
  if (!sql) {
    return memoryStore.slice(0, 8);
  }

  const rows = await sql`
    select
      id,
      employee_name,
      target_role_title,
      score,
      matched_skills,
      missing_skills,
      created_at
    from analyses
    order by created_at desc
    limit 8
  `;

  return rows.map((row) => ({
    id: String(row.id),
    employeeName: String(row.employee_name),
    targetRole: String(row.target_role_title),
    score: Number(row.score),
    matchedSkills: asJson<string[]>(row.matched_skills ?? []),
    missingSkills: asJson<string[]>(row.missing_skills ?? []),
    createdAt: new Date(String(row.created_at)).toISOString()
  })) satisfies AnalysisRecord[];
}
