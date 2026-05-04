DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM (
    'employee',
    'recruiter',
    'hiring_manager',
    'learning_development',
    'system_admin'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "user_role"
  USING (
    CASE
      WHEN "role" IN ('employee', 'recruiter', 'hiring_manager', 'learning_development', 'system_admin')
        THEN "role"::"user_role"
      ELSE 'employee'::"user_role"
    END
  );
