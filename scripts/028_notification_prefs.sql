-- Preferências de notificação/configurações por usuário (persistência das Configurações).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
