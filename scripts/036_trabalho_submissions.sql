-- Migration 036: entrega de "trabalho" pelo aluno (texto e/ou arquivos)
-- O professor define em settings.submission o modo exigido (texto | arquivo | ambos)
-- e a quantidade máxima de arquivos. Estas colunas guardam a entrega do aluno.

ALTER TABLE public.classroom_activity_submissions
  ADD COLUMN IF NOT EXISTS submission_text text,
  ADD COLUMN IF NOT EXISTS submission_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
