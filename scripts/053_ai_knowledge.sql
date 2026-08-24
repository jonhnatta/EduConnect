do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_documents'::regclass
      and conname = 'uq_ai_documents_id_teacher'
  ) then
    alter table public.ai_documents
      add constraint uq_ai_documents_id_teacher unique (id, teacher_id);
  end if;
end;
$$;

create table if not exists public.ai_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(btrim(content)) > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (document_id, chunk_index),
  foreign key (document_id, teacher_id)
    references public.ai_documents(id, teacher_id) on delete cascade
);

create index if not exists idx_ai_document_chunks_teacher_document
  on public.ai_document_chunks (teacher_id, document_id, chunk_index);
create index if not exists idx_ai_document_chunks_hash
  on public.ai_document_chunks (content_hash);

drop trigger if exists handle_ai_document_chunks_updated_at on public.ai_document_chunks;
create trigger handle_ai_document_chunks_updated_at
  before update on public.ai_document_chunks
  for each row execute function public.handle_updated_at();

create table if not exists public.ai_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  job_type text not null check (job_type in ('ingest', 'embed', 'delete', 'reconcile')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  correlation_id uuid not null,
  attempts integer not null default 0 check (attempts >= 0),
  expected_content_hash text check (expected_content_hash is null or expected_content_hash ~ '^[0-9a-f]{64}$'),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check ((job_type = 'reconcile' and document_id is null)
    or (job_type <> 'reconcile' and document_id is not null)),
  check ((status = 'failed' and error_code is not null) or (status <> 'failed' and error_code is null)),
  check ((status = 'processing' and started_at is not null and completed_at is null)
    or (status = 'completed' and started_at is not null and completed_at is not null)
    or (status in ('pending', 'failed') and completed_at is null)),
  foreign key (document_id, teacher_id)
    references public.ai_documents(id, teacher_id) on delete cascade
);

create index if not exists idx_ai_ingestion_jobs_pending
  on public.ai_ingestion_jobs (status, created_at) where status in ('pending', 'failed');
create index if not exists idx_ai_ingestion_jobs_teacher_created
  on public.ai_ingestion_jobs (teacher_id, created_at desc);
create unique index if not exists uq_ai_ingestion_jobs_identity
  on public.ai_ingestion_jobs (
    teacher_id,
    job_type,
    correlation_id,
    coalesce(document_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

drop trigger if exists handle_ai_ingestion_jobs_updated_at on public.ai_ingestion_jobs;
create trigger handle_ai_ingestion_jobs_updated_at
  before update on public.ai_ingestion_jobs
  for each row execute function public.handle_updated_at();
