create unique index if not exists uq_classrooms_id_professor
  on public.classrooms (id, professor_id);

create table if not exists public.ai_beta_access (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  daily_request_limit integer check (daily_request_limit is null or daily_request_limit > 0),
  monthly_token_limit bigint check (monthly_token_limit is null or monthly_token_limit > 0),
  allowed_features text[] not null default '{}'::text[],
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id),
  check (expires_at is null or expires_at > coalesce(starts_at, created_at))
);

create index if not exists idx_ai_beta_access_enabled_expires
  on public.ai_beta_access (enabled, expires_at);

drop trigger if exists handle_ai_beta_access_updated_at on public.ai_beta_access;
create trigger handle_ai_beta_access_updated_at
  before update on public.ai_beta_access
  for each row execute function public.handle_updated_at();

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  classroom_id uuid,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  archived_at timestamptz,
  deleted_at timestamptz,
  unique (id, teacher_id),
  check (
    (status = 'active' and archived_at is null and deleted_at is null)
    or (status = 'archived' and archived_at is not null and deleted_at is null)
    or (status = 'deleted' and deleted_at is not null)
  ),
  check (archived_at is null or archived_at >= created_at),
  check (deleted_at is null or deleted_at >= created_at),
  foreign key (classroom_id, teacher_id)
    references public.classrooms(id, professor_id)
    on delete set null (classroom_id)
);

create index if not exists idx_ai_conversations_teacher_created
  on public.ai_conversations (teacher_id, created_at desc);
create index if not exists idx_ai_conversations_status_created
  on public.ai_conversations (status, created_at desc);
create index if not exists idx_ai_conversations_classroom
  on public.ai_conversations (classroom_id) where classroom_id is not null;

drop trigger if exists handle_ai_conversations_updated_at on public.ai_conversations;
create trigger handle_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.handle_updated_at();

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'streaming', 'completed', 'failed', 'cancelled', 'blocked')),
  model text,
  provider text,
  prompt_version text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  error_code text,
  check (
    (status in ('pending', 'streaming') and completed_at is null)
    or (status in ('completed', 'failed', 'cancelled', 'blocked') and completed_at is not null)
  ),
  check (completed_at is null or completed_at >= created_at),
  check ((status = 'failed' and error_code is not null) or (status <> 'failed')),
  unique (id, conversation_id)
);

create index if not exists idx_ai_messages_conversation_created
  on public.ai_messages (conversation_id, created_at);
create index if not exists idx_ai_messages_status_created
  on public.ai_messages (status, created_at);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  message_id uuid,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'blocked')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost numeric(18,8) not null default 0 check (estimated_cost >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  langfuse_trace_id text,
  correlation_id text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  check (
    (status = 'queued' and started_at is null and completed_at is null)
    or (status = 'running' and started_at is not null and completed_at is null)
    or (status in ('completed', 'failed') and started_at is not null and completed_at is not null)
    or (status in ('cancelled', 'blocked') and completed_at is not null)
  ),
  check (started_at is null or started_at >= created_at),
  check (completed_at is null or completed_at >= coalesce(started_at, created_at)),
  check ((status = 'failed' and error_code is not null) or (status <> 'failed')),
  foreign key (conversation_id, teacher_id)
    references public.ai_conversations(id, teacher_id) on delete cascade,
  foreign key (message_id, conversation_id)
    references public.ai_messages(id, conversation_id) on delete cascade
);

create index if not exists idx_ai_runs_teacher_created
  on public.ai_runs (teacher_id, created_at desc);
create index if not exists idx_ai_runs_conversation_created
  on public.ai_runs (conversation_id, created_at desc);
create index if not exists idx_ai_runs_message
  on public.ai_runs (message_id, conversation_id) where message_id is not null;
create index if not exists idx_ai_runs_status_created
  on public.ai_runs (status, created_at);
create unique index if not exists uq_ai_runs_correlation_id
  on public.ai_runs (correlation_id);

create table if not exists public.ai_tool_executions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_runs(id) on delete cascade,
  tool_name text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled', 'blocked')),
  arguments_hash text not null,
  result_count integer check (result_count is null or result_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  check ((status = 'failed' and error_code is not null) or (status <> 'failed'))
);

create index if not exists idx_ai_tool_executions_run_created
  on public.ai_tool_executions (run_id, created_at);
create index if not exists idx_ai_tool_executions_status_created
  on public.ai_tool_executions (status, created_at);

create table if not exists public.ai_citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.ai_messages(id) on delete cascade,
  source_kind text not null check (source_kind in ('internal', 'web')),
  source_id text,
  title text not null,
  url text,
  retrieved_at timestamptz not null default timezone('utc'::text, now()),
  chunk_reference text,
  content_hash text not null,
  display_order integer not null check (display_order >= 0),
  unique (message_id, display_order)
);

create table if not exists public.ai_draft_actions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null,
  action_type text not null,
  target_type text not null,
  target_id uuid,
  payload jsonb not null,
  payload_hash text not null,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'applied', 'expired', 'rejected', 'failed')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  check (expires_at > created_at),
  check ((status in ('confirmed', 'applied') and confirmed_at is not null) or (status = 'proposed' and confirmed_at is null) or status in ('expired', 'rejected', 'failed')),
  check (confirmed_at is null or confirmed_at >= created_at),
  check (confirmed_at is null or confirmed_at < expires_at),
  check ((status = 'applied' and applied_at is not null) or (status <> 'applied' and applied_at is null)),
  check (applied_at is null or (applied_at >= confirmed_at and applied_at < expires_at)),
  foreign key (conversation_id, teacher_id)
    references public.ai_conversations(id, teacher_id) on delete cascade
);

create or replace function public.enforce_ai_draft_action_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' then
      raise exception 'AI draft actions must be inserted as proposed'
        using errcode = '23514';
    end if;
    if new.confirmed_at is not null or new.applied_at is not null then
      raise exception 'AI draft timestamps are managed by the database'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if row(
    new.id,
    new.teacher_id,
    new.conversation_id,
    new.action_type,
    new.target_type,
    new.target_id,
    new.payload,
    new.payload_hash,
    new.expires_at,
    new.created_at
  ) is distinct from row(
    old.id,
    old.teacher_id,
    old.conversation_id,
    old.action_type,
    old.target_type,
    old.target_id,
    old.payload,
    old.payload_hash,
    old.expires_at,
    old.created_at
  ) then
    raise exception 'AI draft identity and payload are immutable'
      using errcode = '22023';
  end if;

  if old.status in ('applied', 'expired', 'rejected', 'failed') then
    if new.status <> old.status then
      raise exception 'AI draft terminal status is immutable'
        using errcode = '22023';
    end if;
  elsif not (
    (old.status = 'proposed' and new.status in ('proposed', 'confirmed', 'rejected', 'expired', 'failed'))
    or (old.status = 'confirmed' and new.status in ('confirmed', 'applied', 'rejected', 'expired', 'failed'))
  ) then
    raise exception 'Invalid AI draft status transition from % to %', old.status, new.status
      using errcode = '22023';
  end if;

  if old.status = 'proposed' and new.status = 'confirmed' then
    if new.confirmed_at is not null then
      raise exception 'confirmed_at is managed by the database'
        using errcode = '22023';
    end if;
    if timezone('utc'::text, now()) >= timezone('utc'::text, new.expires_at)
      or timezone('utc'::text, v_now) >= timezone('utc'::text, new.expires_at) then
      raise exception 'Expired AI draft cannot be confirmed'
        using errcode = '22023';
    end if;
    new.confirmed_at := v_now;
    new.applied_at := null;
  elsif old.status = 'confirmed' and new.status = 'applied' then
    if new.applied_at is not null then
      raise exception 'applied_at is managed by the database'
        using errcode = '22023';
    end if;
    if timezone('utc'::text, now()) >= timezone('utc'::text, new.expires_at)
      or timezone('utc'::text, v_now) >= timezone('utc'::text, new.expires_at) then
      raise exception 'Expired AI draft cannot be applied'
        using errcode = '22023';
    end if;
    new.confirmed_at := old.confirmed_at;
    new.applied_at := v_now;
  else
    if new.confirmed_at is distinct from old.confirmed_at
      or new.applied_at is distinct from old.applied_at then
      raise exception 'AI draft timestamps are managed by the database'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_ai_draft_action_transition on public.ai_draft_actions;
create trigger enforce_ai_draft_action_transition
  before insert or update on public.ai_draft_actions
  for each row execute function public.enforce_ai_draft_action_transition();

create index if not exists idx_ai_draft_actions_teacher_created
  on public.ai_draft_actions (teacher_id, created_at desc);
create index if not exists idx_ai_draft_actions_conversation_created
  on public.ai_draft_actions (conversation_id, created_at desc);
create index if not exists idx_ai_draft_actions_status_expires
  on public.ai_draft_actions (status, expires_at);

create table if not exists public.ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  reserved_tokens bigint not null default 0 check (reserved_tokens >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, usage_date)
);

drop trigger if exists handle_ai_usage_daily_updated_at on public.ai_usage_daily;
create trigger handle_ai_usage_daily_updated_at
  before update on public.ai_usage_daily
  for each row execute function public.handle_updated_at();

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid,
  source_type text not null,
  source_id text not null,
  version integer not null check (version > 0),
  content_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'extracting', 'embedding', 'indexed', 'failed', 'deleting', 'deleted')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  indexed_at timestamptz,
  deleted_at timestamptz,
  error_code text,
  unique (teacher_id, source_type, source_id, version),
  check (
    (status in ('pending', 'extracting', 'embedding') and indexed_at is null and deleted_at is null and error_code is null)
    or (status = 'indexed' and indexed_at is not null and deleted_at is null and error_code is null)
    or (status = 'failed' and deleted_at is null and error_code is not null)
    or (status = 'deleting' and deleted_at is null)
    or (status = 'deleted' and deleted_at is not null)
  ),
  check (indexed_at is null or indexed_at >= created_at),
  check (deleted_at is null or deleted_at >= created_at),
  foreign key (classroom_id, teacher_id)
    references public.classrooms(id, professor_id)
    on delete set null (classroom_id)
);

create index if not exists idx_ai_documents_teacher_created
  on public.ai_documents (teacher_id, created_at desc);
create index if not exists idx_ai_documents_status_created
  on public.ai_documents (status, created_at);
create index if not exists idx_ai_documents_classroom
  on public.ai_documents (classroom_id) where classroom_id is not null;

drop trigger if exists handle_ai_documents_updated_at on public.ai_documents;
create trigger handle_ai_documents_updated_at
  before update on public.ai_documents
  for each row execute function public.handle_updated_at();
