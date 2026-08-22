alter table public.profiles
  add column if not exists terms_accepted_version text,
  add column if not exists privacy_accepted_version text;

-- Aceites anteriores continuam auditáveis como versão legada, sem fingir que o
-- titular aceitou os documentos publicados em 16/07/2026.
update public.profiles
   set terms_accepted_version = coalesce(terms_accepted_version, 'legacy-unversioned'),
       privacy_accepted_version = coalesce(privacy_accepted_version, 'legacy-unversioned')
 where terms_accepted_at is not null;
