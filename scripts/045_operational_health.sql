create table if not exists public.service_heartbeats (
  service_name text primary key,
  instance_id text not null,
  status text not null check (status in ('ready', 'stopping', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_service_heartbeats_time
  on public.service_heartbeats (heartbeat_at desc);
