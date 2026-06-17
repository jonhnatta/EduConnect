-- Migration 032: Salas abertas vs fechadas
-- is_public = true: aparece em "Explorar Salas" sem precisar de código de convite.
-- is_public = false (padrão): acesso somente via código de convite.

ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_classrooms_public
  ON public.classrooms (is_public, status)
  WHERE is_public = true AND status = 'ativa';
