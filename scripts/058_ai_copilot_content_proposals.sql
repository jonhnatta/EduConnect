do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'content_items_id_author_id_key'
       and conrelid = 'public.content_items'::regclass
  ) then
    alter table public.content_items
      add constraint content_items_id_author_id_key unique (id, author_id);
  end if;
end $$;

create table if not exists public.ai_content_proposals (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null,
  module text not null check (module in (
    'article', 'exercise', 'assessment', 'simulado', 'tip', 'review', 'performance', 'classroom'
  )),
  mode text not null check (mode in ('generate', 'review')),
  original_content jsonb,
  payload jsonb not null,
  change_summary text not null check (char_length(btrim(change_summary)) between 1 and 1200),
  payload_hash text not null check (char_length(payload_hash) = 64),
  provider text not null check (char_length(btrim(provider)) between 1 and 160),
  model text not null check (char_length(btrim(model)) between 1 and 160),
  status text not null default 'proposed'
    check (status in ('proposed', 'rejected', 'saved', 'blocked', 'failed')),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 200),
  content_item_id uuid,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, idempotency_key),
  foreign key (conversation_id, teacher_id)
    references public.ai_conversations(id, teacher_id) on delete cascade,
  constraint ai_content_proposals_content_item_owner_fkey
    foreign key (content_item_id, teacher_id)
    references public.content_items(id, author_id) on delete restrict,
  check (original_content is null or jsonb_typeof(original_content) = 'object'),
  check (jsonb_typeof(payload) = 'object'),
  check (payload ? 'module' and payload->>'module' = module),
  check (payload ? 'mode' and payload->>'mode' = mode),
  check (payload ? 'model' and payload->>'model' = model),
  check (payload ? 'changeSummary' and payload->>'changeSummary' = change_summary),
  check ((status = 'saved' and content_item_id is not null) or (status <> 'saved' and content_item_id is null))
);

create index if not exists idx_ai_content_proposals_teacher_updated
  on public.ai_content_proposals (teacher_id, updated_at desc, id desc);

create index if not exists idx_ai_content_proposals_teacher_status_updated
  on public.ai_content_proposals (teacher_id, status, updated_at desc, id desc);

create index if not exists idx_ai_content_proposals_teacher_module_updated
  on public.ai_content_proposals (teacher_id, module, updated_at desc, id desc);

create index if not exists idx_ai_content_proposals_content_item
  on public.ai_content_proposals (content_item_id)
  where content_item_id is not null;

drop trigger if exists handle_ai_content_proposals_updated_at
  on public.ai_content_proposals;
create trigger handle_ai_content_proposals_updated_at
  before update on public.ai_content_proposals
  for each row execute function public.handle_updated_at();
