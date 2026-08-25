create table if not exists public.ai_lesson_plan_proposals (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'rejected', 'saved', 'blocked', 'failed')),
  payload jsonb not null,
  payload_hash text not null,
  model text not null check (char_length(btrim(model)) between 1 and 160),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 200),
  content_item_id uuid references public.content_items(id) on delete restrict,
  safety_decision text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, idempotency_key),
  foreign key (conversation_id, teacher_id)
    references public.ai_conversations(id, teacher_id) on delete cascade,
  check (jsonb_typeof(payload) = 'object'),
  check (payload ? 'model' and payload->>'model' = model),
  check ((status = 'saved' and content_item_id is not null) or (status <> 'saved' and content_item_id is null)),
  check (safety_decision is null or safety_decision in (
    'approved',
    'approved_with_warning',
    'regenerate',
    'abstain',
    'blocked',
    'human_review_required'
  ))
);

create index if not exists idx_ai_lesson_plan_proposals_teacher_created
  on public.ai_lesson_plan_proposals (teacher_id, created_at desc);

create index if not exists idx_ai_lesson_plan_proposals_conversation_created
  on public.ai_lesson_plan_proposals (conversation_id, created_at desc);

create index if not exists idx_ai_lesson_plan_proposals_status_created
  on public.ai_lesson_plan_proposals (status, created_at desc);

create index if not exists idx_ai_lesson_plan_proposals_content_item
  on public.ai_lesson_plan_proposals (content_item_id)
  where content_item_id is not null;

drop trigger if exists handle_ai_lesson_plan_proposals_updated_at
  on public.ai_lesson_plan_proposals;
create trigger handle_ai_lesson_plan_proposals_updated_at
  before update on public.ai_lesson_plan_proposals
  for each row execute function public.handle_updated_at();
