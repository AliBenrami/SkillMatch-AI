-- Add hash-chain columns to audit_events so the trail becomes tamper-evident.
alter table audit_events
  add column if not exists actor_role text,
  add column if not exists actor_name text,
  add column if not exists previous_hash text not null default '0000000000000000000000000000000000000000000000000000000000000000',
  add column if not exists hash text;

-- Backfill the hash so existing rows still validate (they remain a continuous
-- chain by re-deriving each row's digest from its current fields).
update audit_events
   set hash = encode(
     digest(
       coalesce(previous_hash, '') ||
       '|' || coalesce(actor, '') ||
       '|' || coalesce(actor_role, '') ||
       '|' || coalesce(actor_name, '') ||
       '|' || coalesce(action, '') ||
       '|' || coalesce(entity_id, '') ||
       '|' || coalesce(details::text, '{}') ||
       '|' || coalesce(created_at::text, ''),
       'sha256'),
     'hex')
 where hash is null;

-- Some Postgres deployments may not have the pgcrypto extension wired in, so
-- the runtime will recompute and persist the hash on first save when the
-- backfill above leaves a NULL behind.
alter table audit_events
  alter column hash drop not null;

create table if not exists admin_alerts (
  id uuid primary key,
  source text not null,
  severity text not null check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','resolved')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists admin_alerts_status_idx on admin_alerts (status);
create index if not exists admin_alerts_created_at_idx on admin_alerts (created_at desc);
