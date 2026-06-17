-- Migration 031: Soft-delete de conta (LGPD Art. 18)
-- deleted_at marcado mas dados mantidos por 30 dias por obrigação legal.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;
