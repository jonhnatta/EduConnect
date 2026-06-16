# Auditoria de Segurança — EduConnect (Junho/2026)

> Auditoria profunda de vulnerabilidades, falhas de autorização e furos de regra de negócio.
> Cada achado abaixo foi **confirmado lendo o código real**. Caminhos no formato `arquivo:linha`.

## Falha arquitetural raiz (define todo o resto)

**O app conecta no Postgres como `app_user`, que é SUPERUSER com `BYPASSRLS = true`.**
Confirmado empiricamente (`pg_roles.rolsuper = t`, `rolbypassrls = t`) e a camada `lib/db/query.ts` nunca executa `SET app.current_user_id`, então `auth.uid()` sempre retorna `NULL`.

Consequências:
1. **Toda a Row Level Security (scripts 001–022) é código morto.** Nenhuma policy filtra linha alguma. O banco devolve/edita qualquer registro.
2. **100% da autorização precisa estar na aplicação.** Qualquer query que recebe um id do cliente sem amarrar à posse/permissão é um IDOR direto.
3. **Qualquer SQL injection vira compromisso TOTAL** (leitura/escrita arbitrária e, como superuser, potencial RCE via `COPY ... PROGRAM`). Felizmente não encontramos SQLi — mas o raio de explosão é máximo.

Correção: criar um papel de aplicação **sem** superuser/bypassrls, dono mínimo das tabelas, e (idealmente) injetar `SET LOCAL app.current_user_id` por request para a RLS voltar a ter efeito como segunda camada de defesa.

---

## 🔴 CRÍTICO

### C1 — Gabarito de provas exposto sem autenticação (3 vetores)
- `app/actions/content-exercise-submissions.ts:530` — `getMcqSolutionsForContentExercise` devolve `{questionId: correctIndex}` de qualquer conteúdo. Sem auth, sem checar submissão, sem posse.
- `app/actions/content-exercise-submissions.ts:549` — `getExamDefinitionForContentItem` devolve a prova **inteira com gabarito**. Sem auth.
- `app/actions/content-items.ts:1991` — `getContentItemById` faz `select * ... where id=$1` e retorna o item completo (incluindo `settings.exam.correctIndex` e `body_html` de rascunhos), sem checar `canViewContentItem`/autoria/status.

Toda função `"use server"` exportada é um endpoint HTTP POST. O gating existe só na página (`/conteudo/[id]`, que é **rota pública**, fora do `/dashboard`). Um aluno — ou anônimo — chama a action direto com o id do conteúdo e recebe o gabarito **antes de responder**, ou lê rascunhos/conteúdo privado/de turmas alheias.

**Fix:** mover a autorização para dentro de cada action: `requireAuthedUser` + só liberar gabarito se o solicitante tiver submissão `enviado` (ou for o autor); `getContentItemById` deve chamar `canViewContentItem(id, userId)` e nunca retornar `correctIndex` para não-autores (usar `toPublicExam`).

---

## 🟠 ALTO

### A1 — Account takeover via vinculação OAuth (pre-hijack)
`app/api/auth/signup/route.ts:38` nunca verifica o e-mail (conta utilizável na hora, `email_verified_at` fica NULL). Em `lib/auth/social-user.ts:41`, quando um login Google chega para um e-mail já existente, a trava só desfaz a fusão se `email_verified=false`. Para um Google real (`email_verified=true`) a identidade Google é **vinculada à conta de senha pré-existente**.
**Exploração:** atacante pré-registra `vitima@gmail.com` com senha conhecida → vítima entra depois com Google → ambas as credenciais apontam para a mesma linha → atacante mantém acesso pela senha.
**Fix:** não auto-vincular Google a conta local com `email_verified_at IS NULL`; exigir verificação de e-mail no signup, ou forçar re-autenticação por senha no linking.

### A2 — `/api/article-attachment` serve mídia privada sem autenticação (IDOR)
`app/api/article-attachment/route.ts:33` só checa que a linha do `content_item` existe — sem `getAuthedUser`, sem checar autoria/status. Streama o blob privado (capas, imagens de artigos em rascunho) para qualquer um que tenha/adivinhe o pathname.
**Fix:** exigir usuário e liberar só se for o autor ou se o conteúdo está `published` e visível ao solicitante.

### A3 — Professor não aprovado/suspenso cria e edita provas
`app/actions/classroom-activities.ts:290` (`createActivity`) e `:363` (`updateActivity`) usam `requireAuthedUser` + `assertProfessorOwnsClassroom` — **não checam `professor_verification_status = 'approved'`** (e `requireAuthedUser` nem confere que é professor). Um professor rebaixado/suspenso que ainda é dono de salas continua publicando atividades avaliativas.
**Fix:** usar `getApprovedProfessorActionAccess` em create/update/delete de atividade e uploads.

### A4 — Submissão de prova aceita após o prazo
`app/actions/activity-submissions.ts:279` (`submitExam`) e `:207` (`saveSubmissionDraft`) só bloqueiam `status === 'encerrada'`/`'rascunho'`. As colunas `starts_at`/`due_at` da atividade **nunca são lidas**, e não há fechamento automático por data. Enquanto o professor não encerrar manualmente, o aluno envia depois do prazo (ou antes da abertura).
**Fix:** validar `now` contra `starts_at`/`due_at` nas duas actions (espelhar `assertAssessmentStudentWriteAllowed` que já existe no fluxo de conteúdo).

---

## 🟡 MÉDIO

### M1 — `/api/profile-image` serve avatar/capa de perfil privado sem auth (IDOR)
`app/api/profile-image/route.ts:28` só verifica a existência da linha. Imagens de perfis `private` ficam baixáveis por qualquer um com o `profileId`. **Fix:** exigir auth e checar `visibility`/posse.

### M2 — `complete-profile` permite trocar `user_type` à vontade
`app/api/auth/complete-profile/route.ts` não checa se `user_type` já está definido; `upsertProfile` (`lib/auth/profile.ts:40`) usa `coalesce(excluded.user_type, ...)` que sempre adota o novo valor. Qualquer usuário logado faz `POST {userType:'professor'}` e alterna aluno↔professor. Não concede status `approved` (verificação é separada), mas fura a escolha única de tipo de conta. **Fix:** rejeitar se `user_type` já setado; permitir só a transição NULL → {aluno|professor}.

### M3 — Race condition no limite de tentativas do reset de senha
`app/api/auth/password-reset/verify/route.ts:38` lê a linha do código sem transação/`FOR UPDATE`, checa `attempts >= max_attempts` sobre esse snapshot e só depois incrementa. Requisições concorrentes leem `attempts=0` juntas e furam o teto de 5 tentativas. (A rota `confirm` já usa `FOR UPDATE` — só a `verify` está vulnerável.) **Fix:** `UPDATE ... SET attempts = attempts + 1 WHERE id=$1 AND attempts < max_attempts RETURNING ...` (atômico) e tratar 0 linhas como "excedido".

### M4 — Código de convite de sala fraco + sem rate-limit
`lib/classrooms/invite-code.ts:14` gera `EDU-` + 4 chars de um alfabeto de 32 = **32⁴ ≈ 1,05 milhão**. O preview por código é chamável anonimamente e sem rate-limit → enumeração viável que vaza metadados da sala (nome, disciplina, professor) e permite entrada indevida. **Fix:** 6–8 caracteres, rate-limit por IP, e não expor metadados ricos no preview anônimo.

### M5 — `AUTH_SECRET` parece ser valor de desenvolvimento
O `.env` traz `AUTH_SECRET='dev…'`. Se reutilizado em produção, é uma chave de assinatura de JWT previsível → permite forjar sessões. (O `.env` **não** está commitado — isso está correto.) **Fix:** gerar segredo aleatório forte por ambiente.

### M6 — Validação de upload confia no Content-Type do cliente
Só `uploadProfileImage` valida magic bytes (`sniffImageMime`). Os demais uploads (anexos de artigo/atividade/material, capa, dica, doc de verificação) validam só `file.type`/extensão declarados. As rotas de serving copiam o content-type do blob e servem `inline` (`article-attachment/route.ts:64`). Vetor de XSS armazenado / type-confusion, especialmente via SVG. **Fix:** validar magic bytes em todos os uploads; nas rotas de serving, forçar content-type seguro de uma allowlist + `X-Content-Type-Options: nosniff` e `Content-Disposition: attachment` para documentos.

---

## 🟢 BAIXO

- **B1** — `app/actions/content-items.ts:1813-1989`: `toggleContentLike`/`toggleContentSave`/`recordContentView`/`recordContentShare` não checam `canViewContentItem` (vazam contadores e permitem interação com conteúdo oculto; `recordContentShare` nem exige login). Espelhar a checagem que `createContentComment` já faz.
- **B2** — `app/actions/activity-submissions.ts:366-527`: correção/listagem de entregas usa guard de professor **não-aprovado** (`getProfessorActionAccess`). Posse é checada (não é cross-tenant), mas professor suspenso ainda corrige. Trocar por `getApprovedProfessorActionAccess` se a regra exigir aprovação.
- **B3** — `app/api/professor-verification/upload/route.ts:57`: `if (file.type && !ALLOWED.has(file.type))` — `file.type` vazio (trivial no multipart) **pula** a validação; sem magic bytes. Tornar o MIME obrigatório + sniff de conteúdo.
- **B4** — Rotas de serving validam só o 2º segmento do pathname como UUID; o resto (com `../`) é repassado ao backend de blob. Hoje mitigado porque o backend colapsa `..`, mas a defesa não está na rota. Validar o pathname inteiro com regex estrita.
- **B5** — `app/api/auth/signup/route.ts:61`: 409 "Este e-mail já está cadastrado" + diferença de timing no login (conta OAuth-only não roda bcrypt) = enumeração de usuários. Resposta neutra + `bcrypt.compare` dummy para usuário inexistente.

---

## ✅ Pontos positivos (o que está correto)

- **Sem SQL injection:** todas as queries usam placeholders `$1..$n` parametrizados (inclusive os filtros dinâmicos de `professors.ts`).
- **Rich text sanitizado em dupla camada:** `body_html` passa por DOMPurify ao salvar (`lib/sanitize-activity-html.ts`) **e** ao renderizar (`components/rich-text-content.tsx`).
- **Guards de autorização consultam o banco**, não o JWT (`lib/auth/guards.ts`) — o claim `userType` é só UX.
- **`password-reset/confirm` é atômico** (`FOR UPDATE`); o request de reset é resistente a enumeração (resposta genérica).
- **Avatar valida magic bytes.** Regras de follow (sem auto-follow, só aluno segue) corretas na aplicação.

### Achado refutado
- **Contador de seguidores (follows.ts):** o trigger `tr_teacher_followers_count` **existe** (`scripts/022_teacher_followers.sql:39`) e mantém `followers_count`. Sem inconsistência. **Não é problema.**

---

## Plano de correção priorizado

1. **C1** — fechar o vazamento de gabarito (3 actions) — *risco imediato à integridade das provas.*
2. **A3 + A4** — impor aprovação e prazo nas atividades de sala.
3. **A1** — corrigir a vinculação OAuth / verificação de e-mail no signup.
4. **A2 + M1** — autenticar e autorizar as rotas de blob (`article-attachment`, `profile-image`).
5. **Arquitetura** — migrar o app para um papel Postgres sem superuser/BYPASSRLS.
6. **M2, M3, M4, M5, M6** — role toggle, race do reset, entropia do convite, AUTH_SECRET, validação de upload.
7. **B1–B5** — endurecimentos restantes.
