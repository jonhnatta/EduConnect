-- Onda 4 (arquitetura) — Princípio do menor privilégio para o papel da aplicação.
--
-- CONTEXTO: hoje o app conecta como `app_user`, que é SUPERUSER + BYPASSRLS. Isso significa
-- que qualquer SQL injection viraria compromisso TOTAL do servidor (leitura de arquivos,
-- COPY ... PROGRAM => RCE, acesso a outros bancos). Como `app_user` é DONO de todas as
-- tabelas e nenhuma tem FORCE ROW LEVEL SECURITY, o dono já ignora a RLS — então remover
-- SUPERUSER/BYPASSRLS NÃO quebra o app (o owner continua lendo/escrevendo suas tabelas),
-- mas reduz drasticamente o raio de explosão de uma eventual injeção.
--
-- A extensão pgcrypto (única operação que exigia superuser) é criada no bootstrap, ANTES
-- deste script. Em runtime o superuser não é mais necessário.
--
-- ⚠️ APLICAR E TESTAR DELIBERADAMENTE (a equipe deve validar os fluxos principais depois):
--     docker exec -i edu-postgres psql -U app_user -d appdb -f - < scripts/024_least_privilege_app_role.sql
--   ou rodar o conteúdo abaixo manualmente.
--
-- REVERTER (se algo quebrar):
--     ALTER ROLE app_user SUPERUSER BYPASSRLS;

ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS;

-- Verificação esperada: rolsuper = f, rolbypassrls = f
-- SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';

-- ─────────────────────────────────────────────────────────────────────────────
-- PRÓXIMO PASSO (opcional, defesa em profundidade — projeto à parte):
-- Para a RLS (policies com auth.uid()) voltar a VALER como segunda camada:
--   1. Criar um papel de app que NÃO seja dono das tabelas e não tenha BYPASSRLS,
--      com apenas GRANT SELECT/INSERT/UPDATE/DELETE no schema public.
--   2. Apontar DATABASE_URL para esse papel.
--   3. Em lib/db/query.ts, abrir uma transação por request e executar
--      `SET LOCAL app.current_user_id = <uid>` antes das queries, para auth.uid()
--      retornar o usuário corrente. Só então as policies passam a filtrar de fato.
-- Isso exige testar TODOS os fluxos e por isso fica como evolução separada.
