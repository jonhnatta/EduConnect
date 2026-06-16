-- Application schema for "Postgres only" mode.
-- App schema for Postgres-only mode.
-- The app must enforce permissions in server actions.

create extension if not exists pgcrypto;

-- 002_classrooms.sql (tables)
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  subject text not null default '',
  education_level text not null default '',
  description text,
  invite_code text not null unique,
  max_students int,
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_classrooms_professor on public.classrooms (professor_id);
create index if not exists idx_classrooms_invite on public.classrooms (invite_code);

create table if not exists public.classroom_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (classroom_id, student_id)
);

create index if not exists idx_classroom_members_classroom on public.classroom_members (classroom_id);
create index if not exists idx_classroom_members_student on public.classroom_members (student_id);

create or replace function public.is_classroom_member(p_classroom_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.classroom_members cm
    where cm.classroom_id = p_classroom_id and cm.student_id = p_user_id
  );
$$;

create or replace function public.is_classroom_professor(p_classroom_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.classrooms c
    where c.id = p_classroom_id and c.professor_id = p_user_id
  );
$$;

-- Public preview of a classroom by invite code (used before joining).
create or replace function public.get_classroom_by_invite_code(p_code text)
returns table (
  id uuid,
  name text,
  subject text,
  education_level text,
  professor_name text,
  status text
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.subject,
    c.education_level,
    coalesce(p.full_name, '')::text as professor_name,
    c.status::text
  from public.classrooms c
  join public.profiles p on p.id = c.professor_id
  where upper(trim(c.invite_code)) = upper(trim(p_code));
$$;

-- Join by invite code for a specific user id.
create or replace function public.join_classroom_by_invite(p_user_id uuid, p_invite_code text)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_classroom_id uuid;
  v_max int;
  v_count int;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (
    select 1 from public.profiles where id = p_user_id and user_type = 'aluno'
  ) then
    return json_build_object('ok', false, 'error', 'only_students');
  end if;

  select c.id, c.max_students
    into v_classroom_id, v_max
  from public.classrooms c
  where upper(trim(c.invite_code)) = upper(trim(p_invite_code))
    and c.status = 'ativa';

  if v_classroom_id is null then
    return json_build_object('ok', false, 'error', 'invalid_or_closed');
  end if;

  select count(*)::int into v_count
  from public.classroom_members
  where classroom_id = v_classroom_id;

  if v_max is not null and v_count >= v_max then
    return json_build_object('ok', false, 'error', 'full');
  end if;

  insert into public.classroom_members (classroom_id, student_id)
  values (v_classroom_id, p_user_id)
  on conflict (classroom_id, student_id) do nothing;

  return json_build_object('ok', true, 'classroom_id', v_classroom_id);
end;
$$;

-- 009_content_items.sql (tables + triggers + helper funcs)
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'article',
  title text not null,
  body_html text,
  status text not null default 'draft',
  visibility text not null,
  published_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  like_count integer not null default 0 check (like_count >= 0),
  share_count integer not null default 0 check (share_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.content_items
  add column if not exists comment_count integer not null default 0;

create table if not exists public.content_item_classrooms (
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  primary key (content_item_id, classroom_id)
);

create table if not exists public.content_reactions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'like',
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (content_item_id, user_id, reaction_type)
);

create table if not exists public.content_share_events (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  share_method text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.content_comments (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  parent_id uuid references public.content_comments(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_content_comments_item_created
  on public.content_comments (content_item_id, created_at asc);
create index if not exists idx_content_comments_user
  on public.content_comments (user_id);
create index if not exists idx_content_comments_parent
  on public.content_comments (parent_id);

create or replace function public.content_reactions_adjust_like_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.reaction_type = 'like' then
    update public.content_items
      set like_count = like_count + 1, updated_at = timezone('utc'::text, now())
      where id = new.content_item_id;
  elsif tg_op = 'DELETE' and old.reaction_type = 'like' then
    update public.content_items
      set like_count = greatest(0, like_count - 1), updated_at = timezone('utc'::text, now())
      where id = old.content_item_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_content_reactions_like_count on public.content_reactions;
create trigger tr_content_reactions_like_count
  after insert or delete on public.content_reactions
  for each row execute function public.content_reactions_adjust_like_count();

create or replace function public.content_share_events_bump_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.content_items
    set share_count = share_count + 1, updated_at = timezone('utc'::text, now())
    where id = new.content_item_id;
  return new;
end;
$$;

drop trigger if exists tr_content_share_events_count on public.content_share_events;
create trigger tr_content_share_events_count
  after insert on public.content_share_events
  for each row execute function public.content_share_events_bump_count();

create or replace function public.content_comments_adjust_comment_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.content_items
      set comment_count = comment_count + 1, updated_at = timezone('utc'::text, now())
      where id = new.content_item_id;
  elsif tg_op = 'DELETE' then
    update public.content_items
      set comment_count = greatest(0, comment_count - 1), updated_at = timezone('utc'::text, now())
      where id = old.content_item_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_content_comments_count on public.content_comments;
create trigger tr_content_comments_count
  after insert or delete on public.content_comments
  for each row execute function public.content_comments_adjust_comment_count();

create or replace function public.handle_content_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

update public.content_items ci
set comment_count = counted.total
from (
  select content_item_id, count(*)::integer as total
  from public.content_comments
  group by content_item_id
) counted
where ci.id = counted.content_item_id
  and ci.comment_count <> counted.total;

drop trigger if exists tr_content_items_updated_at on public.content_items;
create trigger tr_content_items_updated_at
  before update on public.content_items
  for each row execute function public.handle_updated_at();

drop trigger if exists tr_content_comments_updated_at on public.content_comments;
create trigger tr_content_comments_updated_at
  before update on public.content_comments
  for each row execute function public.handle_content_comments_updated_at();

create or replace function public.content_comments_validate_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.content_comments parent
    where parent.id = new.parent_id
      and parent.content_item_id = new.content_item_id
      and parent.parent_id is null
  ) then
    raise exception 'Resposta permitida apenas para comentario raiz do mesmo conteudo';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_content_comments_validate_parent on public.content_comments;
create trigger tr_content_comments_validate_parent
  before insert or update of parent_id, content_item_id on public.content_comments
  for each row execute function public.content_comments_validate_parent();

create or replace function public.is_profile_professor(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.user_type = 'professor'
  );
$$;

create or replace function public.user_can_view_content_item(p_content_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v record;
begin
  select ci.id, ci.author_id, ci.status, ci.visibility
  into v
  from public.content_items ci
  where ci.id = p_content_id;

  if v.id is null then
    return false;
  end if;

  if v.status <> 'published' then
    return p_user_id is not null and v.author_id = p_user_id;
  end if;

  if v.visibility = 'public' then
    return true;
  end if;

  if v.visibility = 'private' then
    return p_user_id is not null and v.author_id = p_user_id;
  end if;

  if v.visibility = 'classrooms' then
    if p_user_id is null then
      return false;
    end if;
    if v.author_id = p_user_id then
      return true;
    end if;
    return exists (
      select 1
      from public.content_item_classrooms cic
      where cic.content_item_id = p_content_id
        and public.is_classroom_member(cic.classroom_id, p_user_id)
    );
  end if;

  return false;
end;
$$;

-- Feed for a given user id (no auth.uid())
create or replace function public.feed_content_items_for_user(p_user_id uuid, p_limit int default 20)
returns setof public.content_items
language sql
stable
set search_path = public
as $$
  select ci.*
  from public.content_items ci
  where ci.status = 'published'
    and (
      ci.visibility = 'public'
      or (
        ci.visibility = 'classrooms'
        and exists (
          select 1 from public.content_item_classrooms cic
          where cic.content_item_id = ci.id
            and public.is_classroom_member(cic.classroom_id, p_user_id)
        )
      )
      or (
        ci.visibility = 'private'
        and ci.author_id = p_user_id
      )
    )
  order by ci.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- Constraints/extensions for content types/status/visibility (ported from later scripts)
alter table public.content_items
  drop constraint if exists content_items_type_check;
alter table public.content_items
  add constraint content_items_type_check
  check (type in ('article', 'exercise', 'assessment', 'simulado', 'dica'));

alter table public.content_items
  drop constraint if exists content_items_status_check;
alter table public.content_items
  add constraint content_items_status_check
  check (status in ('draft', 'published', 'verificando', 'revisao', 'aguardando_decisao'));

alter table public.content_items
  drop constraint if exists content_items_visibility_check;
alter table public.content_items
  add constraint content_items_visibility_check
  check (visibility in ('public', 'classrooms', 'private'));

-- 003_classroom_activities.sql
create table if not exists public.classroom_activities (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  type text not null check (type in ('trabalho', 'prova_objetiva', 'lista_exercicios', 'simulado')),
  title text not null,
  description text,
  starts_at timestamptz,
  due_at timestamptz,
  max_score numeric,
  status text not null default 'rascunho' check (status in ('rascunho', 'aberta', 'encerrada')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_classroom_activities_classroom_due
  on public.classroom_activities (classroom_id, due_at desc nulls last);

drop trigger if exists handle_classroom_activities_updated_at on public.classroom_activities;
create trigger handle_classroom_activities_updated_at
  before update on public.classroom_activities
  for each row execute function public.handle_updated_at();

-- 004_classroom_materials.sql
create table if not exists public.classroom_materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  title text not null,
  description text,
  external_url text,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_classroom_materials_classroom_created
  on public.classroom_materials (classroom_id, created_at desc);

drop trigger if exists handle_classroom_materials_updated_at on public.classroom_materials;
create trigger handle_classroom_materials_updated_at
  before update on public.classroom_materials
  for each row execute function public.handle_updated_at();

-- 005_classroom_activity_submissions.sql
create table if not exists public.classroom_activity_submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.classroom_activities(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado')),
  answers jsonb not null default '{}'::jsonb,
  score_mcq numeric not null default 0,
  open_scores jsonb not null default '{}'::jsonb,
  score_total numeric,
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (activity_id, student_id)
);

create index if not exists idx_activity_submissions_activity
  on public.classroom_activity_submissions (activity_id);
create index if not exists idx_activity_submissions_student
  on public.classroom_activity_submissions (student_id);

drop trigger if exists handle_activity_submissions_updated_at on public.classroom_activity_submissions;
create trigger handle_activity_submissions_updated_at
  before update on public.classroom_activity_submissions
  for each row execute function public.handle_updated_at();

-- 006_classroom_mural_cover.sql
alter table public.classrooms
  add column if not exists cover_image_pathname text;

-- 014_profile_social_fields.sql
alter table public.profiles
  add column if not exists cover_url text;
alter table public.profiles
  add column if not exists profile_visibility text not null default 'private';
alter table public.profiles
  drop constraint if exists profiles_profile_visibility_check;
alter table public.profiles
  add constraint profiles_profile_visibility_check
  check (profile_visibility in ('public', 'private'));

-- Postgres-only: professor verification fields (kept on profiles for simplicity).
alter table public.profiles
  add column if not exists professor_verification_status text;
alter table public.profiles
  add column if not exists professor_verification_doc_url text;
alter table public.profiles
  add column if not exists professor_verification_submitted_at timestamptz;

alter table public.profiles
  alter column professor_verification_status set default 'none';

alter table public.profiles
  drop constraint if exists profiles_professor_verification_status_check;
alter table public.profiles
  add constraint profiles_professor_verification_status_check
  check (professor_verification_status in ('none', 'pending', 'approved', 'rejected'));

-- Verificação por IA + fila de análise manual (scripts/026).
alter table public.profiles
  add column if not exists professor_verification_ai_reason text;
alter table public.profiles
  add column if not exists professor_verification_manual_requested_at timestamptz;
alter table public.profiles
  add column if not exists professor_verification_reviewed_at timestamptz;
create index if not exists idx_profiles_verification_manual_queue
  on public.profiles (professor_verification_manual_requested_at)
  where professor_verification_status = 'pending'
    and professor_verification_manual_requested_at is not null;

-- Consentimento LGPD (scripts/025): momento do aceite de Termos + Privacidade.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

-- 008_student_planner_personal_tasks.sql
create table if not exists public.student_planner_personal_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  notes text,
  scheduled_on date not null,
  is_done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_planner_personal_student_date
  on public.student_planner_personal_tasks (student_id, scheduled_on);

drop trigger if exists handle_student_planner_personal_tasks_updated_at
  on public.student_planner_personal_tasks;
create trigger handle_student_planner_personal_tasks_updated_at
  before update on public.student_planner_personal_tasks
  for each row execute function public.handle_updated_at();

-- 010_content_exercises.sql (submissions)
create table if not exists public.content_exercise_submissions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado')),
  answers jsonb not null default '{}'::jsonb,
  score_mcq numeric not null default 0,
  open_scores jsonb not null default '{}'::jsonb,
  score_total numeric,
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (content_item_id, student_id)
);

create index if not exists idx_content_exercise_submissions_item
  on public.content_exercise_submissions (content_item_id);
create index if not exists idx_content_exercise_submissions_student
  on public.content_exercise_submissions (student_id);

drop trigger if exists tr_content_exercise_submissions_updated_at on public.content_exercise_submissions;
create trigger tr_content_exercise_submissions_updated_at
  before update on public.content_exercise_submissions
  for each row execute function public.handle_updated_at();

-- 014_content_review.sql
create table if not exists public.content_review_results (
  id                uuid        primary key default gen_random_uuid(),
  content_item_id   uuid        not null references public.content_items(id) on delete cascade,
  score             integer     not null check (score >= 0 and score <= 100),
  seal              text        not null default 'none' check (seal in ('none', 'excellence')),
  findings          jsonb       not null default '[]'::jsonb,
  warning_reason    text,
  reviewed_at       timestamptz not null default timezone('utc'::text, now()),
  unique (content_item_id)
);

create index if not exists idx_content_review_results_item
  on public.content_review_results (content_item_id);

-- 007_classroom_performance_stats.sql (ported)
create or replace function public.class_activity_score_stats(p_user_id uuid, p_classroom_id uuid)
returns table (
  activity_id uuid,
  avg_score numeric,
  score_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    s.activity_id,
    avg(s.score_total)::numeric,
    count(*)::bigint
  from public.classroom_activity_submissions s
  inner join public.classroom_activities ca on ca.id = s.activity_id
  where ca.classroom_id = p_classroom_id
    and ca.status <> 'rascunho'
    and ca.settings ? 'exam'
    and s.status = 'enviado'
    and s.score_total is not null
    and (
      public.is_classroom_professor(p_classroom_id, p_user_id)
      or public.is_classroom_member(p_classroom_id, p_user_id)
    )
  group by s.activity_id;
$$;
