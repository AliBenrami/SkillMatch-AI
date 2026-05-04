do $$ begin
  create type user_role as enum (
    'employee',
    'recruiter',
    'hiring_manager',
    'learning_development',
    'system_admin'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists users (
  id uuid primary key,
  name text not null,
  email text not null,
  role user_role not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists analyses (
  id uuid primary key,
  employee_name text not null,
  target_role_id text not null,
  target_role_title text not null,
  resume_text text not null,
  score integer not null check (score >= 0 and score <= 100),
  matched_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  explanation text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigserial primary key,
  actor text not null,
  action text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists candidate_recommendations (
  id uuid primary key,
  candidate_name text not null,
  file_name text not null,
  storage_url text not null,
  structured_resume jsonb not null,
  top_positions jsonb not null,
  best_role_title text not null,
  best_score integer not null check (best_score >= 0 and best_score <= 100),
  created_at timestamptz not null default now()
);

create table if not exists saved_target_roles (
  id uuid primary key,
  employee_email text not null,
  role_id text not null,
  role_title text not null,
  target_score integer not null default 80 check (target_score >= 1 and target_score <= 100),
  current_score integer check (current_score is null or (current_score >= 0 and current_score <= 100)),
  matched_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analyses_created_at_idx on analyses (created_at desc);
create index if not exists analyses_target_role_idx on analyses (target_role_id);
create index if not exists audit_events_created_at_idx on audit_events (created_at desc);
create index if not exists candidate_recommendations_created_at_idx on candidate_recommendations (created_at desc);
create index if not exists candidate_recommendations_best_score_idx on candidate_recommendations (best_score desc);
create index if not exists saved_target_roles_employee_idx on saved_target_roles (employee_email);
create unique index if not exists saved_target_roles_employee_role_idx on saved_target_roles (employee_email, role_id);
create unique index if not exists users_email_idx on users (email);
