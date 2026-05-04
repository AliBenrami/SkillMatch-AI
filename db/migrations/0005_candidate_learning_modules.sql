alter table candidate_recommendations
  add column if not exists assigned_learning_modules jsonb not null default '[]'::jsonb;
