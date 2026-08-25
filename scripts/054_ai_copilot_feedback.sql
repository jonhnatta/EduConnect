create table if not exists public.ai_message_feedback (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  rating text not null check (rating in ('positive', 'negative')),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, conversation_id, message_id),
  foreign key (conversation_id, teacher_id)
    references public.ai_conversations(id, teacher_id) on delete cascade,
  foreign key (message_id, conversation_id)
    references public.ai_messages(id, conversation_id) on delete cascade
);

create index if not exists idx_ai_message_feedback_teacher_created
  on public.ai_message_feedback (teacher_id, created_at desc);

drop trigger if exists handle_ai_message_feedback_updated_at on public.ai_message_feedback;
create trigger handle_ai_message_feedback_updated_at
  before update on public.ai_message_feedback
  for each row execute function public.handle_updated_at();
