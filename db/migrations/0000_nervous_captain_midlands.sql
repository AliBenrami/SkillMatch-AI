CREATE TABLE IF NOT EXISTS "analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"employee_name" text NOT NULL,
	"target_role_id" text NOT NULL,
	"target_role_title" text NOT NULL,
	"resume_text" text NOT NULL,
	"score" integer NOT NULL,
	"matched_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_score_check" CHECK ("analyses"."score" >= 0 and "analyses"."score" <= 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_recommendations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"candidate_name" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_url" text NOT NULL,
	"structured_resume" jsonb NOT NULL,
	"top_positions" jsonb NOT NULL,
	"best_role_title" text NOT NULL,
	"best_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_recommendations_best_score_check" CHECK ("candidate_recommendations"."best_score" >= 0 and "candidate_recommendations"."best_score" <= 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyses_created_at_idx" ON "analyses" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyses_target_role_idx" ON "analyses" USING btree ("target_role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_recommendations_created_at_idx" ON "candidate_recommendations" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_recommendations_best_score_idx" ON "candidate_recommendations" USING btree ("best_score" DESC NULLS LAST);
