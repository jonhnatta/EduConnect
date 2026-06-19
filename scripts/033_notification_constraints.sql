-- Migration 033: Constraints adicionais na tabela de notificações

-- Garante que apenas tipos conhecidos são inseridos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
        CHECK (type IN ('new_follower','new_content','activity_graded','activity_deadline','review_result'));
  END IF;

  -- Limita tamanho da mensagem (a aplicação já trunca em 500 chars)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_message_length'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_message_length
        CHECK (char_length(message) <= 500);
  END IF;
END;
$$;
