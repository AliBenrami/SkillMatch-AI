import { sql } from "drizzle-orm";
import { bigserial, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ResumeAiInsight } from "@/lib/resume-ai-insight";
import type { UserRole } from "@/lib/validation";

export const userRole = pgEnum("user_role", [
  "employee",
  "recruiter",
  "hiring_manager",
  "learning_development",
  "system_admin"
] satisfies [UserRole, ...UserRole[]]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: userRole("role").notNull(),
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
    actorRole: text("actor_role"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    previousHash: text("previous_hash")
      .notNull()
      .default(sql`'0000000000000000000000000000000000000000000000000000000000000000'`),
    hash: text("hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("audit_events_created_at_idx").on(table.createdAt.desc()),
    index("audit_events_action_idx").on(table.action),
    index("audit_events_actor_idx").on(table.actor),
    index("audit_events_entity_id_idx").on(table.entityId)
  ]
);

export const adminAlerts = pgTable(
  "admin_alerts",
  {
    id: uuid("id").primaryKey(),
    source: text("source").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by")
  },
  (table) => [
    index("admin_alerts_status_idx").on(table.status),
    index("admin_alerts_created_at_idx").on(table.createdAt.desc()),
    check("admin_alerts_severity_check", sql`${table.severity} in ('info','warning','critical')`),
    check("admin_alerts_status_check", sql`${table.status} in ('open','resolved')`)
  ]
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
    aiInsight: jsonb("ai_insight").$type<ResumeAiInsight | null>(),
    assignedLearningModules: jsonb("assigned_learning_modules").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
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

export const savedTargetRoles = pgTable(
  "saved_target_roles",
  {
    id: uuid("id").primaryKey(),
    employeeEmail: text("employee_email").notNull(),
    roleId: text("role_id").notNull(),
    roleTitle: text("role_title").notNull(),
    targetScore: integer("target_score").notNull().default(80),
    currentScore: integer("current_score"),
    matchedSkills: jsonb("matched_skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    missingSkills: jsonb("missing_skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    progressPercent: integer("progress_percent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("saved_target_roles_employee_role_idx").on(table.employeeEmail, table.roleId),
    index("saved_target_roles_employee_idx").on(table.employeeEmail),
    check("saved_target_roles_target_score_check", sql`${table.targetScore} >= 1 and ${table.targetScore} <= 100`),
    check(
      "saved_target_roles_current_score_check",
      sql`${table.currentScore} is null or (${table.currentScore} >= 0 and ${table.currentScore} <= 100)`
    ),
    check(
      "saved_target_roles_progress_percent_check",
      sql`${table.progressPercent} >= 0 and ${table.progressPercent} <= 100`
    )
  ]
);
