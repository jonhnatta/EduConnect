# Status das correções de segurança

Branch: `security/wave-0-answer-key-leak` · Typecheck ✅ · Docker rebuild ✅ · App no ar ✅
Referências: `SECURITY_AUDIT_2026-06.md` (achados) · `SECURITY_REMEDIATION_PLAN.md` (plano).

## ✅ Implementado

| Item | Onde | O que mudou |
|------|------|-------------|
| **C1** gabarito (3 vetores) | `content-exercise-submissions.ts`, `content-items.ts` | `getMcqSolutions...` e `getExamDefinition...` agora exigem auth e só liberam gabarito ao autor ou a quem já enviou. `getContentItemById` chama `canViewContentItem` e remove `correctIndex` para não-autor (`toPublicExam`). |
| **A1** account takeover OAuth | `lib/auth/social-user.ts` | Ao vincular Google verificado a conta de senha pré-existente, invalida a senha (pré-hijack neutralizado). |
| **A2** IDOR article-attachment | `app/api/article-attachment/route.ts` | Autoriza via `user_can_view_content_item` antes de servir. |
| **A3** professor não aprovado | `app/actions/classroom-activities.ts` | `create/update/deleteActivity` + uploads usam `getApprovedProfessorActionAccess`. |
| **A4** prazo de prova | `app/actions/activity-submissions.ts` | `submitExam`/`saveSubmissionDraft` impõem `starts_at`/`due_at` (novo `assertActivityWindowAllowed`). |
| **M1** IDOR profile-image | `app/api/profile-image/route.ts` | Privado só para autenticados; fecha scraping anônimo. |
| **M2** troca de user_type | `app/api/auth/complete-profile/route.ts` | Bloqueia alternar papel após definido (409). |
| **M3** race no reset | `app/api/auth/password-reset/verify/route.ts` | Transação + `FOR UPDATE` (igual ao confirm). |
| **M4** entropia do convite | `lib/classrooms/invite-code.ts` | Código 4→6 chars (32⁴→32⁶ ≈ 1 bilhão). |
| **M5** AUTH_SECRET | `.env` | Rotacionado para 48 bytes aleatórios. **Invalida sessões — re-login necessário.** |
| **M6** (parcial) serving inline | `lib/http/safe-serving.ts` + 3 rotas | `X-Content-Type-Options: nosniff` + `attachment` para não-imagens (fecha entrega de XSS armazenado). |
| **B1** toggles sem visibilidade | `content-items.ts` | `canViewContentItem` em like/save/view/share. |
| **B2** correção por aprovado | `activity-submissions.ts` | `gradeOpenAnswers` exige professor aprovado. |
| **B3** MIME vazio na verificação | `professor-verification/upload/route.ts` | MIME obrigatório (rejeita vazio). |
| **B4** path traversal | 3 rotas de serving | Rejeita `..`, `//`, `\`. |
| **B5** timing no login | `auth.ts` | `bcrypt.compare` dummy para usuário inexistente/OAuth-only. |

## ⏳ Pendente / decisão de produto

- **Onda 4 (arquitetura)** — script `scripts/024_least_privilege_app_role.sql` pronto. **Aplicar e testar manualmente** (removido superuser/BYPASSRLS do `app_user`; o owner segue ignorando RLS, então o app não quebra). A alteração ao vivo foi propositalmente deixada para aplicação deliberada. Revert documentado no próprio script.
- **M6 (restante)** — sniff de magic bytes em cada upload (hoje só o avatar valida). O vetor de XSS já está fechado no serving; o restante é defesa adicional contra type-confusion.
- **B5 (signup)** — o 409 "e-mail já cadastrado" ainda revela existência. Tornar neutro exige fluxo por e-mail + ajuste de UX (decisão de produto).
- **Rate-limiting** — preview/join de sala por código e endpoints de auth ainda sem limitador (precisa de tabela/infra de rate-limit).
