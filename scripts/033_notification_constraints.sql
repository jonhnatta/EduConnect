-- Migration 033: Constraints adicionais na tabela de notificações

-- Garante que apenas tipos conhecidos são inseridos
ALTER TABLE public.notifications
  ADD CONSTRAINT IF NOT EXISTS notifications_type_check
    CHECK (type IN ('new_follower', 'new_content', 'activity_graded', 'activity_deadline', 'review_result'));

-- Limita tamanho da mensagem (a aplicação já trunca em 500 chars)
ALTER TABLE public.notifications
  ADD CONSTRAINT IF NOT EXISTS notifications_message_length
    CHECK (char_length(message) <= 500);
