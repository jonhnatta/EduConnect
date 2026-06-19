-- Migration 030: Notifications system
-- Tabela central de notificações para alunos e professores

CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          text        NOT NULL,   -- 'new_follower' | 'new_content' | 'activity_graded' | 'activity_deadline'
  actor_id      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_id     uuid,                   -- content_item_id, activity_id, etc.
  entity_type   text,                   -- 'content_item' | 'activity' | 'classroom'
  message       text        NOT NULL,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (recipient_id, read_at)
  WHERE read_at IS NULL;
