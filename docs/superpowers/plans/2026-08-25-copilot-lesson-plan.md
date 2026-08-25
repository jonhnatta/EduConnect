# Plano de Aula com Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que professores autorizados gerem, revisem e salvem um plano de aula como rascunho em `content_items`, sem publicação automática.

**Architecture:** A tela existente de criação chama uma API contextual do Copilot. A API valida sessão, aprovação, beta, cota e conteúdo autorizado, gera uma proposta estruturada via provider existente e salva a proposta antes da confirmação. O salvamento confirmado cria um `content_item` draft em transação idempotente.

**Tech Stack:** Next.js App Router, TypeScript, Zod, PostgreSQL, `pg`, CopilotService, OpenAI, Qdrant, Langfuse, sanitizador HTML existente e testes Node.

---

## Mapa de arquivos

- Criar `lib/ai/copilot/lesson-plan.ts` com tipos e schemas.
- Criar `lib/ai/copilot/lesson-plan-service.ts` com geração, prévia e conversão idempotente.
- Criar `app/api/copilot/lesson-plans/route.ts` para gerar propostas.
- Criar `app/api/copilot/lesson-plans/[proposalId]/route.ts` para leitura e rejeição.
- Criar `app/api/copilot/lesson-plans/[proposalId]/save/route.ts` para confirmação.
- Modificar `app/dashboard/professor/criar/criar-conteudo-client.tsx` adicionando ação e prévia.
- Criar `scripts/057_ai_lesson_plan_proposals.sql` para propostas, citações e chave idempotente.
- Modificar `scripts/migrate.mjs` para registrar a migração.
- Criar `tests/lesson-plan-schema.test.ts`, `lesson-plan-access.test.ts`, `lesson-plan-service.test.ts`, `lesson-plan-api.test.ts` e `lesson-plan-ui.test.ts`.
- Modificar `README.md` apenas para documentar o fluxo local se necessário.

### Task 1: Contrato estruturado e limites

**Files:** Create `lib/ai/copilot/lesson-plan.ts`; create `tests/lesson-plan-schema.test.ts`.

- [ ] Escrever testes falhando para tema obrigatório, duração entre 15 e 300, máximo de 8 objetivos, 12 etapas e 12 materiais, texto de etapa limitado, e contrato de saída com citações.
- [ ] Rodar `node --test tests/lesson-plan-schema.test.ts` e confirmar falha por módulo ausente.
- [ ] Implementar schemas Zod:

```ts
export const lessonPlanInputSchema = z.object({
  topic: z.string().trim().min(3).max(240),
  audience: z.string().trim().max(160).default(""),
  durationMinutes: z.number().int().min(15).max(300),
  objective: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(2_000).default(""),
  contentIds: z.array(z.string().uuid()).max(20).default([]),
})
```

- [ ] Definir `LessonPlanDraft`, `LessonPlanStep`, status `proposed|rejected|saved|blocked|failed` e contrato de proposta com conversationId, citations, usage, safety e contentItemId opcional.
- [ ] Rodar o teste novamente e confirmar PASS.
- [ ] Commitar `git add lib/ai/copilot/lesson-plan.ts tests/lesson-plan-schema.test.ts && git commit -m "test(ai): define lesson plan contract"`.

### Task 2: Persistência de propostas

**Files:** Create `scripts/057_ai_lesson_plan_proposals.sql`; modify `scripts/migrate.mjs`; create `tests/lesson-plan-service.test.ts`.

- [ ] Escrever teste falhando para criar uma proposta, rejeitá-la e convertê-la uma única vez em rascunho.
- [ ] Rodar `node --test tests/lesson-plan-service.test.ts` e confirmar falha por schema/repository ausente.
- [ ] Criar tabelas com `teacher_id`, `conversation_id`, `status`, `payload`, `payload_hash`, `idempotency_key`, `content_item_id`, `safety_decision`, timestamps e foreign keys para conversa e perfil. Adicionar índice por professor/data e unique `(teacher_id, idempotency_key)`.
- [ ] Registrar versão de migração posterior à atual.
- [ ] Implementar repository transacional com `createProposal`, `getProposal`, `rejectProposal` e `saveDraft`. `saveDraft` deve retornar o item existente em retry e nunca aceitar `author_id` ou `status` do cliente.
- [ ] Rodar testes de serviço e schema.
- [ ] Commitar `git add scripts/057_ai_lesson_plan_proposals.sql scripts/migrate.mjs lib/ai/copilot/lesson-plan-service.ts tests/lesson-plan-service.test.ts && git commit -m "feat(ai): persist lesson plan proposals"`.

### Task 3: Geração contextual e guardrails

**Files:** Modify `lib/ai/copilot/lesson-plan-service.ts`; create `tests/lesson-plan-access.test.ts`.

- [ ] Escrever testes falhando para sessão ausente, aluno, professor não aprovado, beta desabilitado, conteúdo de outro professor, prompt injection e ausência de evidência.
- [ ] Rodar `node --test tests/lesson-plan-access.test.ts` e confirmar falha.
- [ ] Implementar geração usando a mesma elegibilidade, reserva/settlement de cota, retrieval autorizado, guardrail determinístico e telemetria do CopilotService. A cota e a autorização devem preceder retrieval e provider.
- [ ] Validar o output estruturado, exigir citações internas autorizadas quando houver contexto e persistir `blocked` com texto seguro em respostas inválidas.
- [ ] Sanitizar campos textuais antes de qualquer conversão para HTML.
- [ ] Rodar os testes direcionados e a suíte AI.
- [ ] Commitar `git add lib/ai/copilot/lesson-plan-service.ts tests/lesson-plan-access.test.ts tests/lesson-plan-service.test.ts && git commit -m "feat(ai): generate grounded lesson plan proposals"`.

### Task 4: Rotas API

**Files:** Create `app/api/copilot/lesson-plans/route.ts`, `[proposalId]/route.ts`, `[proposalId]/save/route.ts`; create `tests/lesson-plan-api.test.ts`.

- [ ] Escrever testes HTTP para `401`, `403`, `404`, `422`, `429`, `201` na geração, `200` na leitura, `204` na rejeição e `201` ou `200` idempotente no save.
- [ ] Rodar os testes e confirmar falha por rotas ausentes.
- [ ] Implementar handlers usando sessão do professor e schemas. Validar UUID e idempotency key antes de chamar o serviço. Nunca aceitar `author_id`, `user_id`, `status` ou permissões do cliente.
- [ ] Mapear falhas de acesso, cota, provider e proposta para respostas estáveis, sem vazar detalhes internos.
- [ ] Rodar `node --test tests/lesson-plan-api.test.ts` e `npm run test:ai`.
- [ ] Commitar `git add app/api/copilot/lesson-plans tests/lesson-plan-api.test.ts && git commit -m "feat(ai): expose lesson plan api"`.

### Task 5: Integração no fluxo de criação

**Files:** Modify `app/dashboard/professor/criar/criar-conteudo-client.tsx`; create `tests/lesson-plan-ui.test.ts`.

- [ ] Escrever teste exigindo botão `Criar plano de aula com Copilot`, formulário, loading, erro, prévia, citações, rejeição, edição e confirmação.
- [ ] Rodar o teste e confirmar falha.
- [ ] Adicionar modal/painel contextual sem remover o fluxo manual atual. O formulário deve enviar somente os campos permitidos e manter a proposta no estado do cliente por ID.
- [ ] Renderizar prévia editável dos objetivos, etapas, materiais, atividade, avaliação, adaptações e citações. Exibir botão `Salvar como rascunho` e confirmação explícita.
- [ ] Após save, redirecionar ou atualizar a lista existente de conteúdos. Nunca publicar automaticamente.
- [ ] Rodar `node --test tests/lesson-plan-ui.test.ts`, `npm run lint` e `npx tsc --noEmit`.
- [ ] Commitar `git add app/dashboard/professor/criar/criar-conteudo-client.tsx tests/lesson-plan-ui.test.ts && git commit -m "feat(ai): add lesson plan copilot flow"`.

### Task 6: Validação local e documentação

**Files:** Modify `README.md` somente se o fluxo não estiver documentado.

- [ ] Rodar `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` e `git diff --check`.
- [ ] Subir localmente com `FEATURE_AI_COPILOT=true`, overlay AI e professor aprovado/beta habilitado.
- [ ] Validar geração, edição, rejeição, retry idempotente e presença do rascunho em `/dashboard/professor/conteudos`.
- [ ] Confirmar `GET /api/health/ready` com `{"status":"ready"}`.
- [ ] Documentar no README a ativação, beta enrollment e o fato de que o resultado é sempre rascunho.
- [ ] Revisar `git status --short` e preservar `.env`, `.claude/` e outros arquivos não relacionados.
