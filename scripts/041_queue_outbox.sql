create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  queue_name text not null,
  event_type text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  correlation_id uuid not null default gen_random_uuid(),
  dedup_key text,
  aggregate_type text,
  aggregate_id uuid,
  aggregate_version bigint,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default timezone('utc'::text, now()),
  locked_at timestamptz,
  locked_by text,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_outbox_dispatch
  on public.outbox_events (available_at, created_at)
  where published_at is null;

create index if not exists idx_outbox_aggregate
  on public.outbox_events (aggregate_type, aggregate_id, created_at);

create unique index if not exists uq_outbox_dedup
  on public.outbox_events (queue_name, dedup_key)
  where dedup_key is not null;

create table if not exists public.job_executions (
  job_key text primary key,
  queue_name text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  locked_until timestamptz,
  last_error text,
  progress jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_job_executions_recovery
  on public.job_executions (status, locked_until)
  where status = 'processing';

create table if not exists public.job_dead_letters (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  queue_name text not null,
  job_name text not null,
  event_id uuid,
  attempts integer not null check (attempts > 0),
  last_error text not null,
  failed_at timestamptz not null default timezone('utc'::text, now()),
  replayed_at timestamptz
);

create index if not exists idx_job_dead_letters_failed
  on public.job_dead_letters (failed_at desc)
  where replayed_at is null;

delete from public.notifications newer
using public.notifications older
where newer.recipient_id = older.recipient_id
  and newer.type = older.type
  and newer.entity_id = older.entity_id
  and newer.entity_id is not null
  and newer.id::text > older.id::text;

create unique index if not exists uq_notifications_recipient_event
  on public.notifications (recipient_id, type, entity_id)
  where entity_id is not null;
