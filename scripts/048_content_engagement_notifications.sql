-- Notificacoes de curtidas e comentarios precisam distinguir cada evento,
-- mantendo entity_id como o conteudo de destino para navegacao.

alter table public.notifications
  add column if not exists event_id uuid;

update public.notifications
   set event_id = entity_id
 where event_id is null
   and entity_id is not null;

drop index if exists public.uq_notifications_recipient_event;

create unique index if not exists uq_notifications_recipient_event
  on public.notifications (recipient_id, type, event_id)
  where event_id is not null;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new_follower',
    'new_content',
    'activity_graded',
    'activity_deadline',
    'review_result',
    'submission_received',
    'content_like',
    'content_comment'
  ));
