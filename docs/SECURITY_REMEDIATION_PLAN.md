# Plano de Correção de Segurança — EduConnect

Ordenado do **Crítico ao Baixo**, agrupado em ondas. Cada item traz: arquivo/função, mudança concreta, helper reutilizado, risco de regressão e teste. Referência dos achados: `docs/SECURITY_AUDIT_2026-06.md`.

Princípio transversal: **a RLS é inerte (superuser/BYPASSRLS)** → toda autorização vai dentro da server action/rota. Nunca confiar no gating da página.

---

## 🌊 Onda 0 — CRÍTICO: vazamento de gabarito (C1)

**Objetivo:** nenhuma server action pode devolver `correctIndex`/rascunho/conteúdo privado sem autorização.

### 0.1 `getMcqSolutionsForContentExercise` — `app/actions/content-exercise-submissions.ts:530`
- Adicionar `const user = await requireAuthedUser().catch(() => null); if (!user) return null`.
- Carregar `author_id` do conteúdo e a submissão do usuário (`content_exercise_submissions`).
- Liberar o mapa de gabarito **somente se** `submission.status === 'enviado'` **ou** `user.id === author_id`. Caso contrário, `return null`.
- Reutiliza o padrão já presente em `getExamForContentExercise` (`:99`).

### 0.2 `getExamDefinitionForContentItem` — `:549`
- Adicionar `requireAuthedUser`.
- Liberar a definição completa (com gabarito) **apenas para o autor** (`content_items.author_id === user.id`). Para os demais, `return null` (o aluno usa o caminho público).

### 0.3 `getContentItemById` — `app/actions/content-items.ts:1991`
- Adicionar `const user = await getAuthedUser()` + `const canView = await canViewContentItem(id, user?.id ?? null)` (`:1523`); se `!canView` → `{ ok:false, error:'Conteudo nao encontrado' }`.
- Se o solicitante **não** for o autor e o tipo for exam-like, substituir `settings.exam` por `toPublicExam(...)` (`lib/activities/exam.ts:147`) antes de retornar — remove `correctIndex`.

**Risco:** baixo. As páginas legítimas (autor / aluno após envio) continuam funcionando porque a condição espelha o gating atual da UI.
**Teste:** chamar as 3 actions como (a) anônimo, (b) aluno sem envio, (c) aluno após envio, (d) autor. Só (c parcial) e (d) recebem dados sensíveis.

---

## 🌊 Onda 1 — ALTO: integridade de provas/salas, OAuth e IDOR de blob

### 1.1 A3 — Professor não aprovado cria/edita prova — `app/actions/classroom-activities.ts`
- Trocar `requireAuthedUser` por `getApprovedProfessorActionAccess` em `createActivity` (`:290`), `updateActivity` (`:363`), `deleteActivity` e nos uploads de anexo de atividade. Manter `assertProfessorOwnsClassroom`.
- **Risco:** professores legítimos aprovados não são afetados; suspensos perdem a escrita (comportamento desejado).

### 1.2 A4 — Prazo de prova não imposto — `app/actions/activity-submissions.ts`
- Criar helper `assertClassroomWriteAllowed({ status, startsAt, dueAt, alreadySubmitted })` análogo a `assertAssessmentStudentWriteAllowed` (`content-exercise-submissions.ts:29`).
- Em `submitExam` (`:279`) e `saveSubmissionDraft` (`:207`): incluir `starts_at, due_at` no SELECT da atividade e chamar o helper — rejeitar antes de `starts_at` e depois de `due_at`.
- **Teste:** atividade com `due_at` no passado e `status='aberta'` deve recusar envio.

### 1.3 A2 — IDOR `/api/article-attachment` — `app/api/article-attachment/route.ts`
- Adicionar `getAuthedUser()`; buscar `author_id, status, visibility` do `content_item`.
- Liberar só se: requisitante é o autor; **ou** `status='published'` e visível ao solicitante; para anexos de turma, validar matrícula (espelhar `activity-attachment`).
- **Risco:** links públicos antigos de artigos publicados continuam ok; rascunhos passam a exigir autor.

### 1.4 A1 — Account takeover via OAuth — `lib/auth/social-user.ts:41`
- **Fix imediato:** quando o match for por e-mail (não por provider) e a linha existente tiver `auth_provider IS NULL` **e** `email_verified_at IS NULL`, **recusar a fusão** (rollback) e retornar sentinela → `auth.ts` mapeia para `/login?error=AccountExists`.
- **Endurecimento (follow-up):** exigir verificação de e-mail no signup por senha antes da conta ser utilizável (novo fluxo de e-mail via Resend, já configurado).
- **Teste:** estender `tests/oauth-redirect.test.ts` com o cenário pré-registro+Google.

---

## 🌊 Onda 2 — MÉDIO

| # | Arquivo | Correção |
|---|---------|----------|
| M1 | `app/api/profile-image/route.ts` | Exigir `getAuthedUser`; servir só se `profile.visibility='public'`, o dono, ou relação autorizada. Negar 404 para privado de terceiros. |
| M2 | `app/api/auth/complete-profile/route.ts` | Buscar perfil atual; rejeitar (409) se `user_type` já definido. Permitir só `NULL → {aluno\|professor}`. |
| M3 | `app/api/auth/password-reset/verify/route.ts:38` | Tornar atômico: `UPDATE ... SET attempts = attempts+1 WHERE id=$1 AND attempts < max_attempts RETURNING ...`; 0 linhas ⇒ "muitas tentativas". (Espelhar o `FOR UPDATE` do `confirm`.) |
| M4 | `lib/classrooms/invite-code.ts:14` | Código de 6–8 chars; rate-limit por IP em preview/join (reusar padrão de `password_reset_request_limits`); não vazar metadados ricos no preview anônimo. |
| M5 | `.env` / deploy | Gerar `AUTH_SECRET` aleatório forte por ambiente; nunca reutilizar o valor `dev…` em produção. |
| M6 | uploads + rotas de serving | Validar magic bytes em todos os uploads (estender `sniffImageMime` + assinaturas PDF/vídeo); nas rotas de serving forçar content-type de allowlist + `X-Content-Type-Options: nosniff` + `Content-Disposition: attachment` para documentos. |

---

## 🌊 Onda 3 — BAIXO

| # | Arquivo | Correção |
|---|---------|----------|
| B1 | `app/actions/content-items.ts:1813-1989` | Chamar `canViewContentItem` no início de `toggleContentLike`/`toggleContentSave`/`recordContentView`/`recordContentShare`; exigir auth no share. |
| B2 | `app/actions/activity-submissions.ts:366-527` | Trocar `getProfessorActionAccess` → `getApprovedProfessorActionAccess` em correção/listagem (se a regra exigir aprovação). |
| B3 | `app/api/professor-verification/upload/route.ts:57` | Tornar MIME obrigatório (rejeitar `file.type` vazio) + sniff de magic bytes; só marcar `pending` após validar. |
| B4 | rotas de serving | Validar o pathname **inteiro** com regex estrita (`^articles/<uuid>/(trix\|cover\|dica)/[\w.-]+$` etc.), rejeitar `..`/`//`. |
| B5 | `app/api/auth/signup/route.ts:61` | Resposta neutra em e-mail duplicado + `bcrypt.compare` dummy no login para usuário inexistente; rate-limit; não vazar `detail` de erro. |

---

## 🌊 Onda 4 — ARQUITETURA (transversal, fazer com cuidado)

**Remover o superuser do app e ressuscitar a RLS como segunda camada.**
1. Criar papel `educonnect_app` **sem** `SUPERUSER`/`BYPASSRLS`, com apenas os GRANTs necessários (CRUD nas tabelas `public.*`, sem DDL).
2. Migrar `DATABASE_URL` (docker-compose + `.env`) para esse papel.
3. (Opcional, recomendado) Injetar `SET LOCAL app.current_user_id = <uid>` por request numa transação na camada `lib/db/query.ts`, fazendo as policies `auth.uid()` voltarem a valer — defesa em profundidade sobre as correções de aplicação.
4. Testar todos os fluxos (CRUD de conteúdo, salas, submissões, follows) com o papel restrito.

**Risco:** alto se feito sem teste — pode quebrar queries que dependiam implicitamente do superuser. Fazer por último, em branch separada, com a suíte rodando.

---

## Sequenciamento sugerido
1. **Onda 0** (hoje) — fecha o vazamento de gabarito.
2. **Onda 1** — integridade de avaliação + OAuth + 1 IDOR.
3. **Onda 2** e **Onda 3** — podem ir juntas (mudanças pequenas e isoladas).
4. **Onda 4** — por último, com testes.

Cada onda: branch própria, `npx tsc --noEmit`, rebuild Docker e teste manual dos cenários citados antes de seguir.
