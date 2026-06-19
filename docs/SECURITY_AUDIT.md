# Auditoria de Segurança — EduConnect (pré-MVP)

> Auditoria completa do código (auth, autorização/IDOR, injeção SQL, arquivos/SSRF, XSS/headers/segredos).
> **Veredito:** lógica da aplicação sólida (zero SQLi, IDOR bem tratado, XSS sanitizado, sem SSRF).
> Bloqueadores eram de configuração/hardening. Esta entrega corrige tudo que é tratável em código;
> os itens **OPERACIONAIS** abaixo dependem de você no deploy.

## ✅ Corrigido em código (commit de hardening)

| ID | Item | Onde |
|----|------|------|
| B3 | Headers de segurança + CSP (CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS, Permissions-Policy) | `next.config.mjs` |
| H1 | Rate-limit no login (20/15min por e-mail) | `auth.ts` + `lib/security/rate-limit.ts` |
| H2 | Rate-limit no signup por IP (10/h) + senha mín. 8 + `interests` limitado | `app/api/auth/signup/route.ts` |
| H3 | TLS do Postgres seguro por padrão (`rejectUnauthorized: true`; CA via `DATABASE_SSL_CA`; escape `DATABASE_SSL_INSECURE`) | `lib/db/pool.ts` |
| H4 | Sessão JWT com `maxAge` 7d + `updateAge` (reduz janela de exposição) | `auth.ts` |
| M1 | Audiência aplicada na função canônica de visibilidade (conteúdo "só professores" não vaza para aluno/anônimo via URL direta) | `scripts/038` |
| M2 | Documento de verificação de professor: remove o anterior no reenvio (sem PII órfã) | `app/api/professor-verification/upload/route.ts` |
| M3 | Rate-limit em comentar (10/min), curtir (60/min) e seguir (30/min) | `content-items.ts`, `follows.ts` |
| M5 | `listPublicClassrooms` exige autenticação | `app/actions/classrooms.ts` |
| Low | Política de senha unificada em ≥8 (cadastro/reset/troca) | signup + password-reset/confirm |
| Low | Mensagens de erro do driver `pg` não vazam mais ao cliente (genéricas) | `app/actions/*` |
| Low | Clamp de paginação em `listProfessores` | `app/actions/professors.ts` |

Infra nova: `scripts/039_rate_limits.sql` + `lib/security/rate-limit.ts`.

## 🔴 OPERACIONAL — runbook de go-live

> Ferramentas já preparadas: `scripts/040_runtime_role.sql` (B1) e `.env.production.example` (B2/H3/M4).
> Os passos abaixo **exigem acesso de produção / aos provedores** e só podem ser concluídos por você.

- **B1 — App roda como SUPERUSER do Postgres.** Observação importante: o `app_user` é o *superuser de bootstrap* e **não pode** ser rebaixado (`024` não se aplica). Use o **`scripts/040_runtime_role.sql`** (já criado e validado localmente): cria o papel `app_runtime` `NOSUPERUSER` com os grants necessários (mantém `BYPASSRLS` para o app seguir funcionando, mas remove o raio de RCE). Depois aponte `DATABASE_URL` de produção para `app_runtime`. Migrations continuam rodando com o superuser.
- **B2 — Rotacionar TODOS os segredos** (vazaram em texto plano → comprometidos):
  - `AUTH_SECRET`: **já rotacionado localmente** (`openssl rand -base64 48`). Gere **outro** para produção.
  - `AUTH_GOOGLE_SECRET` (Google Cloud Console), `OPENAI_API_KEY`, `XAI_API_KEY`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `S3_SECRET_KEY`: **revogar e reemitir** no painel de cada provedor — só você tem acesso. Guardar no cofre do host (nunca `.env` em disco no servidor).
- **H3 (deploy) — TLS:** definir `DATABASE_SSL_CA` (PEM do provedor) em produção. O código já valida o certificado por padrão; **não** usar `DATABASE_SSL_INSECURE=true`.
- **M4 — `AUTH_URL=https://...`** em produção (cookie de sessão ganha flag `Secure`).

Template pronto com tudo isso: **`.env.production.example`**.

## 🟡 Follow-ups recomendados (pós-MVP)

- CSP por **nonce** no middleware para remover `'unsafe-inline'` de `script-src`.
- **Token versioning** (`password_changed_at`/`token_version`) para revogar sessões existentes ao trocar senha (hoje mitigado só por `maxAge`).
- **Verificação de e-mail** no cadastro (fecha pre-hijack OAuth e signups falsos).
- Magic-bytes em todos os uploads de imagem (hoje só no avatar).
- Avaliar resposta genérica no signup (o 409 ainda permite enumeração, agora com rate-limit).

## ✅ Verificado e correto (não exigiu ação)

- **SQL injection: zero.** Parametrização `$N` consistente; funções plpgsql sem `EXECUTE` dinâmico.
- **Autorização/IDOR forte:** sem IDOR de escrita; sem vazamento de notas/entregas entre alunos; downloads de entrega restritos ao dono/professor.
- **XSS:** sanitização DOMPurify (allowlist) em dupla camada; comentários auto-escapados pelo React.
- **SSRF: nenhum** — URLs de IA fixas; chaves só no servidor.
- **Reset de senha robusto** (CSPRNG, hash, TTL, 5 tentativas com lock, anti-enumeração); OAuth com defesa anti-pre-hijack.
