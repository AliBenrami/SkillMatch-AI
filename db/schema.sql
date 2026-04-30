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

create index if not exists analyses_created_at_idx on analyses (created_at desc);
create index if not exists analyses_target_role_idx on analyses (target_role_id);
create index if not exists audit_events_created_at_idx on audit_events (created_at desc);
create index if not exists candidate_recommendations_created_at_idx on candidate_recommendations (created_at desc);
create index if not exists candidate_recommendations_best_score_idx on candidate_recommendations (best_score desc);
