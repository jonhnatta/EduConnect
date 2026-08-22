alter table public.users
  add column if not exists session_version bigint not null default 1;

alter table public.users
  drop constraint if exists users_session_version_positive;

alter table public.users
  add constraint users_session_version_positive check (session_version > 0);

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'suspended'));

create index if not exists idx_profiles_account_status
  on public.profiles (account_status)
  where account_status <> 'active';
