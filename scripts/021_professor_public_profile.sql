-- Campos de perfil público para professores.
-- Ordem: aplicar após scripts/001_create_profiles.sql e scripts/015_profile_social_fields.sql.

alter table public.profiles
  add column if not exists slug text unique;

alter table public.profiles
  add column if not exists headline text;

alter table public.profiles
  add column if not exists location text;

alter table public.profiles
  add column if not exists website_url text;

alter table public.profiles
  add column if not exists subjects text[] not null default '{}';

alter table public.profiles
  add column if not exists education_levels text[] not null default '{}';

alter table public.profiles
  add column if not exists public_profile_enabled boolean not null default false;

-- Índice para busca por slug (URL pública do professor)
create unique index if not exists idx_profiles_slug on public.profiles (slug) where slug is not null;
