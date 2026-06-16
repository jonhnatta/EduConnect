-- Registro de consentimento (LGPD): momento em que o usuário aceitou Termos + Privacidade.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
