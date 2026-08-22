alter table public.profiles
  add column if not exists professor_verification_doc_status text not null default 'none';

alter table public.profiles
  add column if not exists professor_verification_rejection_reason text;

alter table public.profiles
  add column if not exists professor_approved_subjects text[];

alter table public.profiles
  drop constraint if exists profiles_professor_verification_doc_status_check;

alter table public.profiles
  add constraint profiles_professor_verification_doc_status_check
  check (professor_verification_doc_status in ('none', 'pending', 'clean', 'infected', 'error'));

alter table public.profiles
  drop constraint if exists profiles_professor_verification_status_check;

alter table public.profiles
  add constraint profiles_professor_verification_status_check
  check (professor_verification_status in ('none', 'pending', 'approved', 'rejected', 'revoked'));

create table if not exists public.admin_users (
  user_id uuid primary key references public.users(id) on delete cascade,
  role text not null check (role in ('reviewer', 'admin')),
  totp_secret_encrypted text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

drop trigger if exists handle_admin_users_updated_at on public.admin_users;
create trigger handle_admin_users_updated_at
  before update on public.admin_users
  for each row execute function public.handle_updated_at();

create table if not exists public.professor_verification_reviews (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null,
  reviewer_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected', 'revoked')),
  previous_status text not null,
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  approved_subjects text[],
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_professor_verification_reviews_professor
  on public.professor_verification_reviews (professor_id, created_at desc);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_admin_audit_events_admin
  on public.admin_audit_events (admin_user_id, created_at desc);

create index if not exists idx_admin_audit_events_target
  on public.admin_audit_events (target_type, target_id, created_at desc);

-- Audit trails are append-only for the application role.
revoke update, delete, truncate on public.professor_verification_reviews from public;
revoke update, delete, truncate on public.admin_audit_events from public;
