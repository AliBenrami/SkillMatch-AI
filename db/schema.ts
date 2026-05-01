import { sql } from "drizzle-orm";
import { bigserial, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
);

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey(),
    employeeName: text("employee_name").notNull(),
    targetRoleId: text("target_role_id").notNull(),
    targetRoleTitle: text("target_role_title").notNull(),
    resumeText: text("resume_text").notNull(),
    score: integer("score").notNull(),
    matchedSkills: jsonb("matched_skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    missingSkills: jsonb("missing_skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    explanation: text("explanation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("analyses_created_at_idx").on(table.createdAt.desc()),
    index("analyses_target_role_idx").on(table.targetRoleId),
    check("analyses_score_check", sql`${table.score} >= 0 and ${table.score} <= 100`)
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("audit_events_created_at_idx").on(table.createdAt.desc())]
);

export const candidateRecommendations = pgTable(
  "candidate_recommendations",
  {
    id: uuid("id").primaryKey(),
    candidateName: text("candidate_name").notNull(),
    fileName: text("file_name").notNull(),
    storageUrl: text("storage_url").notNull(),
    structuredResume: jsonb("structured_resume").notNull(),
    topPositions: jsonb("top_positions").notNull(),
    bestRoleTitle: text("best_role_title").notNull(),
    bestScore: integer("best_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("candidate_recommendations_created_at_idx").on(table.createdAt.desc()),
    index("candidate_recommendations_best_score_idx").on(table.bestScore.desc()),
    check("candidate_recommendations_best_score_check", sql`${table.bestScore} >= 0 and ${table.bestScore} <= 100`)
  ]
);
