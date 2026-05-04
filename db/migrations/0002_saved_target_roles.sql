CREATE TABLE IF NOT EXISTS "saved_target_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"employee_email" text NOT NULL,
	"role_id" text NOT NULL,
	"role_title" text NOT NULL,
	"target_score" integer DEFAULT 80 NOT NULL,
	"current_score" integer,
	"matched_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_target_roles_target_score_check" CHECK ("saved_target_roles"."target_score" >= 1 and "saved_target_roles"."target_score" <= 100),
	CONSTRAINT "saved_target_roles_current_score_check" CHECK ("saved_target_roles"."current_score" is null or ("saved_target_roles"."current_score" >= 0 and "saved_target_roles"."current_score" <= 100)),
	CONSTRAINT "saved_target_roles_progress_percent_check" CHECK ("saved_target_roles"."progress_percent" >= 0 and "saved_target_roles"."progress_percent" <= 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_target_roles_employee_idx" ON "saved_target_roles" USING btree ("employee_email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saved_target_roles_employee_role_idx" ON "saved_target_roles" USING btree ("employee_email","role_id");
