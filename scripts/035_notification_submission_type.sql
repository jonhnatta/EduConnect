-- Migration 035: adiciona o tipo 'submission_received' às notificações
-- (professor é avisado quando um aluno envia uma atividade/avaliação).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;

  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
      CHECK (type IN (
        'new_follower',
        'new_content',
        'activity_graded',
        'activity_deadline',
        'review_result',
        'submission_received'
      ));
END;
$$;
