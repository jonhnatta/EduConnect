create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'content_item')),
  target_id uuid not null,
  category text not null check (category in ('harassment', 'hate', 'sexual', 'violence', 'fraud', 'copyright', 'privacy', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  reviewed_by uuid references public.users(id) on delete set null,
  resolution text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  reviewed_at timestamptz
);

create index if not exists idx_abuse_reports_open_created
  on public.abuse_reports (created_at asc) where status = 'open';

create unique index if not exists uq_abuse_reports_open_target
  on public.abuse_reports (reporter_id, target_type, target_id) where status = 'open';

alter table public.abuse_reports enable row level security;
