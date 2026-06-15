alter table public.profiles
  add column if not exists slug text;

alter table public.profiles
  add column if not exists education_level text;

alter table public.profiles
  add column if not exists employment_status text;

alter table public.profiles
  add column if not exists study_focus text;

drop index if exists idx_profiles_slug;

create unique index if not exists idx_profiles_slug
  on public.profiles (lower(slug))
  where slug is not null;

alter table public.profiles
  drop constraint if exists profiles_employment_status_check;

alter table public.profiles
  add constraint profiles_employment_status_check
  check (
    employment_status in (
      'nao_informado',
      'empregado',
      'buscando_emprego',
      'buscando_estagio',
      'freelancer'
    )
    or employment_status is null
  );
