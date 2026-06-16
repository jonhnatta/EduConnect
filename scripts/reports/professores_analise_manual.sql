-- Relatório diário: professores aguardando ANÁLISE MANUAL.
-- São os que a IA não confirmou e que clicaram em "Solicitar análise manual".
-- Uso:
--   docker exec -i edu-postgres psql -U app_user -d appdb -f - < scripts/reports/professores_analise_manual.sql
--
-- Para APROVAR um professor após a análise:
--   update public.profiles
--     set professor_verification_status = 'approved',
--         professor_verification_reviewed_at = now()
--   where id = '<UUID>';
-- Para REPROVAR:
--   update public.profiles
--     set professor_verification_status = 'rejected',
--         professor_verification_reviewed_at = now()
--   where id = '<UUID>';

SELECT
  p.id,
  u.email,
  p.full_name,
  p.interests,
  p.professor_verification_doc_url            AS documento,
  p.professor_verification_ai_reason          AS motivo_ia,
  p.professor_verification_manual_requested_at AS solicitado_em
FROM public.profiles p
JOIN public.users u ON u.id = p.id
WHERE p.user_type = 'professor'
  AND p.professor_verification_status = 'pending'
  AND p.professor_verification_manual_requested_at IS NOT NULL
ORDER BY p.professor_verification_manual_requested_at ASC;
