-- Migration 040: papel de RUNTIME com menor privilégio (segurança — B1 da auditoria).
--
-- PROBLEMA: a app conecta como o superuser de bootstrap (app_user). O Postgres NÃO permite
-- remover SUPERUSER do superuser de bootstrap, então `024` não se aplica nesse setup.
-- SOLUÇÃO: criar um papel separado SÓ para runtime — NOSUPERUSER (sem RCE/leitura de arquivo
-- via COPY...PROGRAM), com apenas os privilégios de dados que a app precisa.
--
-- Mantém BYPASSRLS porque a autorização é feita na aplicação e as policies RLS usam
-- auth.uid() (nunca setado neste app); sem bypass, um papel NÃO-dono seria bloqueado.
-- O ganho de segurança real é remover o SUPERUSER (raio de explosão de uma injeção).
--
-- COMO USAR (rodar como superuser — app_user/postgres):
--   1) troque a senha abaixo por uma forte;
--   2) docker exec -i edu-postgres psql -U app_user -d appdb < scripts/040_runtime_role.sql
--   3) aponte DATABASE_URL (produção) para app_runtime;
--   4) migrations continuam sendo aplicadas com o superuser (app_user), não com app_runtime.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'TROQUE_ESTA_SENHA'
      NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_runtime;

-- Objetos futuros (novas migrations) já nascem acessíveis ao runtime.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_runtime;

-- Verificação: SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='app_runtime';
-- (esperado: rolsuper = f)
