-- Existing accounts predate email verification and are grandfathered during this migration.
update public.users
   set email_verified_at = coalesce(email_verified_at, timezone('utc'::text, now()));

create table if not exists public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_email_verification_active
  on public.email_verification_codes (user_id, created_at desc)
  where used_at is null;

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  template text not null check (template in ('email_verification', 'password_reset')),
  payload_encrypted text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_email_deliveries_pending
  on public.email_deliveries (created_at)
  where status <> 'sent';

drop trigger if exists handle_email_deliveries_updated_at on public.email_deliveries;
create trigger handle_email_deliveries_updated_at
  before update on public.email_deliveries
  for each row execute function public.handle_updated_at();
