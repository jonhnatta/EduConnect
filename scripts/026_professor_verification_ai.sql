-- Verificação de professor por IA + fila de análise manual.
ALTER TABLE public.profiles
  -- Motivo/decisão da análise automática (mostrado ao professor e ao revisor humano).
  ADD COLUMN IF NOT EXISTS professor_verification_ai_reason text,
  -- Quando o professor solicitou análise manual (entra na fila humana).
  ADD COLUMN IF NOT EXISTS professor_verification_manual_requested_at timestamptz,
  -- Quando a verificação foi decidida (por IA ou humano).
  ADD COLUMN IF NOT EXISTS professor_verification_reviewed_at timestamptz;

-- Índice para o relatório diário da fila manual.
CREATE INDEX IF NOT EXISTS idx_profiles_verification_manual_queue
  ON public.profiles (professor_verification_manual_requested_at)
  WHERE professor_verification_status = 'pending'
    AND professor_verification_manual_requested_at IS NOT NULL;
