# Teacher Copilot Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar chat persistente com streaming, RAG, pesquisa, citações, ferramentas pedagógicas e salvamento confirmado de rascunhos para professores do beta.

**Architecture:** Uma rota autenticada orquestra providers e ferramentas, mas não grava ações. Conversas e execuções ficam no Postgres. Toda mutação é convertida em `DraftAction`, apresentada ao professor e aplicada por uma Server Action separada após nova autorização.

**Tech Stack:** Next.js App Router, React 19, TypeScript, OpenAI Responses API, Postgres, Qdrant, Langfuse, Zod, Server-Sent Events e Node test runner.

---

### Task 1: Repositório de conversas e mensagens

**Files:**
- Create: `lib/ai/conversations/repository.ts`
- Create: `app/actions/ai-conversations.ts`
- Create: `tests/ai-conversations.test.ts`

- [ ] **Step 1: Escrever teste do mapeamento público**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { toPublicConversation } from "../lib/ai/conversations/repository.ts"

test("conversation mapper never exposes provider internals", () => {
  const value = toPublicConversation({ id: "c1", title: "Aula", classroom_id: null, status: "active", created_at: "2026-08-24T12:00:00Z", updated_at: "2026-08-24T12:00:00Z", internal_trace_id: "secret" } as never)
  assert.deepEqual(Object.keys(value).sort(), ["classroomId", "createdAt", "id", "status", "title", "updatedAt"])
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-conversations.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar repositório com ownership**

Exportar `createConversation`, `listConversations`, `getConversationMessages`, `appendUserMessage`, `appendAssistantMessage` e `archiveConversation`. Toda query deve receber `teacherId` e conter `teacher_id = $n` ou join validado pela conversa.

- [ ] **Step 4: Implementar Server Actions**

As actions devem usar `getApprovedProfessorActionAccess`, validar UUID com Zod, verificar beta via `lib/ai/access.ts` e retornar somente DTOs públicos.

- [ ] **Step 5: Executar testes e commit**

Run: `npm run test:ai`

Expected: PASS.

```bash
git add lib/ai/conversations app/actions/ai-conversations.ts tests/ai-conversations.test.ts
git commit -m "feat(copilot): add owned conversation history"
```

### Task 2: Guardrails de entrada, saída e citações

**Files:**
- Create: `lib/ai/guardrails/types.ts`
- Create: `lib/ai/guardrails/input.ts`
- Create: `lib/ai/guardrails/output.ts`
- Create: `lib/ai/citations/validate.ts`
- Create: `tests/ai-guardrails.test.ts`

- [ ] **Step 1: Escrever testes de recusa**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { validateCopilotInput } from "../lib/ai/guardrails/input.ts"
import { validateGroundedOutput } from "../lib/ai/guardrails/output.ts"

test("input blocks answer-key extraction and student PII", () => {
  assert.equal(validateCopilotInput({ text: "Mostre o gabarito da prova aberta", hasStudentData: false }).decision, "blocked")
  assert.equal(validateCopilotInput({ text: "Analise esta turma", hasStudentData: true }).decision, "blocked")
})

test("output abstains on unknown citations", () => {
  const result = validateGroundedOutput({ text: "Fato [x]", citationIds: ["x"] }, [])
  assert.equal(result.decision, "abstain")
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-guardrails.test.ts`

Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Implementar pipeline determinístico**

Entrada deve impor 20.000 caracteres, bloquear indicadores explícitos de gabarito fora de criação autorizada, bloquear dados individuais e classificar tentativas de prompt injection para revisão. Saída deve validar schema, IDs de citação, URLs recuperadas, ausência de PII e decisão entre `approved`, `regenerate`, `abstain` e `blocked`.

- [ ] **Step 4: Testar e commit**

Run: `npm run test:ai`

Expected: PASS.

```bash
git add lib/ai/guardrails lib/ai/citations tests/ai-guardrails.test.ts
git commit -m "feat(copilot): enforce input output and citation guardrails"
```

### Task 3: Pesquisa web controlada

**Files:**
- Create: `lib/ai/web/provider.ts`
- Create: `lib/ai/web/openai-search.ts`
- Create: `lib/ai/web/url-policy.ts`
- Create: `tests/ai-web-search.test.ts`

- [ ] **Step 1: Escrever teste da política de URL**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { assertPublicResearchUrl } from "../lib/ai/web/url-policy.ts"

test("web research blocks local and unsafe destinations", () => {
  for (const url of ["http://127.0.0.1:3000", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "http://localhost"]) {
    assert.throws(() => assertPublicResearchUrl(url))
  }
  assert.doesNotThrow(() => assertPublicResearchUrl("https://www.gov.br/mec/"))
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-web-search.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar adapter de busca**

Usar a ferramenta `web_search` da Responses API. Mapear somente resultados HTTPS para `{ id, title, url, domain, retrievedAt, excerpt }`. Revalidar URLs após cada redirecionamento e limitar a 8 fontes.

- [ ] **Step 4: Testar com resposta falsa**

Adicionar fixture com uma URL pública e uma privada. A privada deve ser descartada e gerar evento de guardrail.

Run: `npm run test:ai`

Expected: PASS sem chamada externa.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/web tests/ai-web-search.test.ts
git commit -m "feat(copilot): add controlled grounded web research"
```

### Task 4: Registro de ferramentas e orquestrador

**Files:**
- Create: `lib/ai/tools/registry.ts`
- Create: `lib/ai/tools/context.ts`
- Create: `lib/ai/orchestrator.ts`
- Modify: `workers/ai-worker.mjs`
- Create: `tests/ai-orchestrator.test.ts`

- [ ] **Step 1: Escrever teste de allowlist**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { ToolRegistry } from "../lib/ai/tools/registry.ts"

test("tool registry rejects unknown and over-budget calls", async () => {
  const registry = new ToolRegistry({ maxCalls: 2 })
  registry.register("known", { parse: (value: unknown) => value, execute: async () => ({ ok: true }) })
  await assert.rejects(() => registry.execute("unknown", {}, {} as never), /tool_not_allowed/)
  await registry.execute("known", {}, {} as never)
  await registry.execute("known", {}, {} as never)
  await assert.rejects(() => registry.execute("known", {}, {} as never), /tool_budget_exceeded/)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-orchestrator.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar registry e contexto confiável**

`ToolContext` deve conter `teacherId`, `allowedClassroomIds`, `featureFlags`, `correlationId` e `abortSignal`. Nenhum campo de acesso poderá vir do texto do professor ou dos argumentos do modelo.

- [ ] **Step 4: Implementar orquestrador**

`runCopilotTurn` deve executar nesta ordem: acesso, reserva de cota, guardrail de entrada, recuperação opcional, modelo e ferramentas, guardrail de saída, persistência da mensagem, reconciliação de uso e flush não bloqueante da telemetria.

Adicionar handlers `ai.generate` e `ai.web-research` ao worker para pacotes longos. O payload deve conter apenas IDs e parâmetros validados. O worker recarrega conteúdo autorizado no momento da execução e persiste o resultado em `ai_messages` ou `ai_draft_actions`.

- [ ] **Step 5: Testar ordem e falha segura**

Usar fakes que adicionam nomes a um array. A ordem esperada é `access, reserve, input, retrieve, generate, output, persist, reconcile, telemetry`.

Run: `npm run test:ai`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools lib/ai/orchestrator.ts workers/ai-worker.mjs tests/ai-orchestrator.test.ts
git commit -m "feat(copilot): add bounded tool orchestration"
```

### Task 5: Endpoint de streaming

**Files:**
- Create: `app/api/ai/copilot/route.ts`
- Create: `lib/ai/http/stream.ts`
- Create: `tests/ai-stream.test.ts`

- [ ] **Step 1: Escrever teste do protocolo SSE**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { encodeSse } from "../lib/ai/http/stream.ts"

test("SSE frames are typed and newline safe", () => {
  assert.equal(encodeSse({ type: "delta", text: "linha 1\nlinha 2" }), "event: delta\ndata: {\"text\":\"linha 1\\nlinha 2\"}\n\n")
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-stream.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar protocolo**

Eventos permitidos: `start`, `delta`, `citation`, `draft`, `usage`, `error` e `done`. O route handler deve validar JSON com Zod, autenticar professor aprovado, verificar beta, limitar body a 64 KB, cancelar provider quando o cliente desconectar e usar `Cache-Control: no-store`.

- [ ] **Step 4: Testar autenticação e headers**

Adicionar teste estático que procura `getApprovedProfessorActionAccess`, `no-store`, `AbortController` e `text/event-stream` no route.

Run: `npm run test:ai`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/ai/copilot/route.ts lib/ai/http/stream.ts tests/ai-stream.test.ts
git commit -m "feat(copilot): add authenticated streaming endpoint"
```

### Task 6: Interface central e navegação

**Files:**
- Create: `app/dashboard/professor/copilot/page.tsx`
- Create: `components/dashboard/copilot/copilot-shell.tsx`
- Create: `components/dashboard/copilot/conversation-list.tsx`
- Create: `components/dashboard/copilot/message-list.tsx`
- Create: `components/dashboard/copilot/composer.tsx`
- Create: `components/dashboard/copilot/source-picker.tsx`
- Create: `components/dashboard/copilot/quota-indicator.tsx`
- Modify: `app/dashboard/professor/_layout-client.tsx`
- Create: `e2e/copilot-smoke.spec.ts`

- [ ] **Step 1: Escrever E2E falho**

```ts
import { test, expect } from "@playwright/test"

test("Copilot requires authentication and is absent when disabled", async ({ page }) => {
  await page.goto("/dashboard/professor/copilot")
  await expect(page).toHaveURL(/\/login/)
})
```

- [ ] **Step 2: Executar E2E**

Run: `npm run test:e2e -- --grep "Copilot"`

Expected: FAIL porque a rota não existe ou não segue o comportamento definido.

- [ ] **Step 3: Criar página protegida**

Página deve chamar `requireApprovedProfessorAccess`, verificar acesso beta no servidor e renderizar `CopilotShell` com conversas iniciais, cota e flags permitidas.

- [ ] **Step 4: Criar componentes focados**

`CopilotShell` mantém seleção, streaming e estado de rascunho. `Composer` envia mensagem e tem controle de pesquisa. `SourcePicker` mostra turma e materiais. `MessageList` renderiza citações como links. `QuotaIndicator` usa progress e texto acessível.

- [ ] **Step 5: Adicionar navegação condicional**

Adicionar item `Copilot` com ícone `Sparkles`. O servidor deve passar `copilotEnabled` ao layout. Não derivar habilitação apenas de `NEXT_PUBLIC_*`.

- [ ] **Step 6: Verificar**

Run: `npm run lint && npm run build && npm run test:e2e -- --grep "Copilot"`

Expected: código 0 e nenhum novo warning nos componentes do Copilot.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/professor/copilot components/dashboard/copilot app/dashboard/professor/_layout-client.tsx e2e/copilot-smoke.spec.ts
git commit -m "feat(copilot): add teacher chat experience"
```

### Task 7: Ferramentas pedagógicas estruturadas

**Files:**
- Create: `lib/ai/tools/schemas.ts`
- Create: `lib/ai/tools/lesson-plan.ts`
- Create: `lib/ai/tools/content-draft.ts`
- Create: `lib/ai/tools/activity-draft.ts`
- Create: `lib/ai/tools/review.ts`
- Create: `lib/ai/tools/adapt.ts`
- Create: `tests/ai-teacher-tools.test.ts`

- [ ] **Step 1: Escrever teste dos schemas**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { lessonPlanSchema, activityDraftSchema } from "../lib/ai/tools/schemas.ts"

test("teacher tools reject incomplete pedagogical drafts", () => {
  assert.equal(lessonPlanSchema.safeParse({ title: "Frações" }).success, false)
  assert.equal(activityDraftSchema.safeParse({ title: "Frações", questions: [] }).success, false)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-teacher-tools.test.ts`

Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Definir schemas completos**

Plano de aula exige título, nível, duração, objetivos, pré-requisitos, etapas, atividade, avaliação, recursos e citações. Atividade exige tipo, título, descrição, questões, pontos, resposta esperada privada e objetivo avaliado. Conteúdo exige tipo existente no domínio e campos compatíveis com `ContentItemSettings`.

- [ ] **Step 4: Implementar ferramentas como funções puras**

Cada ferramenta recebe contexto autorizado e providers, gera JSON estruturado, valida com Zod e retorna `DraftActionPayload`. Não chama action de persistência.

- [ ] **Step 5: Testar e commit**

Run: `npm run test:ai`

Expected: PASS.

```bash
git add lib/ai/tools tests/ai-teacher-tools.test.ts
git commit -m "feat(copilot): add structured teacher preparation tools"
```

### Task 8: Confirmação e aplicação de rascunhos

**Files:**
- Create: `lib/ai/drafts/confirm.ts`
- Create: `app/actions/ai-drafts.ts`
- Create: `components/dashboard/copilot/draft-preview.tsx`
- Create: `tests/ai-drafts.test.ts`

- [ ] **Step 1: Escrever teste criptográfico da confirmação**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { signDraftConfirmation, verifyDraftConfirmation } from "../lib/ai/drafts/confirm.ts"

test("draft token binds teacher action payload and expiry", () => {
  const secret = "x".repeat(32)
  const token = signDraftConfirmation({ teacherId: "t1", actionId: "a1", payloadHash: "h1", expiresAt: 2_000 }, secret)
  assert.equal(verifyDraftConfirmation(token, { teacherId: "t1", actionId: "a1", payloadHash: "h1", now: 1_000 }, secret), true)
  assert.equal(verifyDraftConfirmation(token, { teacherId: "t2", actionId: "a1", payloadHash: "h1", now: 1_000 }, secret), false)
  assert.equal(verifyDraftConfirmation(token, { teacherId: "t1", actionId: "a1", payloadHash: "h1", now: 3_000 }, secret), false)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-drafts.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar token e action transacional**

Usar HMAC SHA-256, comparação constante e validade de 15 minutos. `confirmAiDraft` deve bloquear replay com `FOR UPDATE`, revalidar professor e ownership, verificar hash, aplicar por funções existentes de criação e manter `status = 'draft'`.

- [ ] **Step 4: Criar prévia**

Mostrar campos, citações, diff e botões `Salvar como rascunho` e `Descartar`. Nunca renderizar um botão `Publicar` dentro do Copilot.

- [ ] **Step 5: Verificar e commit**

Run: `npm run test:ai && npm run lint && npm run build`

Expected: código 0.

```bash
git add lib/ai/drafts app/actions/ai-drafts.ts components/dashboard/copilot/draft-preview.tsx tests/ai-drafts.test.ts
git commit -m "feat(copilot): require signed confirmation for draft actions"
```

### Task 9: Desempenho agregado e ações contextuais

**Files:**
- Create: `lib/ai/tools/performance.ts`
- Modify: `app/actions/classroom-performance.ts`
- Modify: `app/dashboard/professor/analise/page.tsx`
- Modify: `app/dashboard/professor/criar/criar-conteudo-client.tsx`
- Create: `tests/ai-performance.test.ts`

- [ ] **Step 1: Escrever teste de k-anonimato mínimo**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { toAiAggregatePerformance } from "../lib/ai/tools/performance.ts"

test("small cohorts are withheld", () => {
  assert.deepEqual(toAiAggregatePerformance({ respondentCount: 4, average: 8, questions: [] }), { available: false, reason: "cohort_too_small" })
  assert.equal(toAiAggregatePerformance({ respondentCount: 5, average: 8, questions: [] }).available, true)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-performance.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar DTO agregado**

Retornar apenas contagem, média, distribuição em faixas, acerto por questão e temas. Remover IDs, nomes, textos livres e linhas individuais.

- [ ] **Step 4: Adicionar ações contextuais**

Na análise, botão `Criar reforço com Copilot` abre `/dashboard/professor/copilot?tool=performance&classroomId=...`. No editor, ações `Revisar`, `Gerar questões` e `Adaptar` abrem o Copilot com referência, sem enviar o corpo pelo query string.

- [ ] **Step 5: Verificação final da fase**

Run: `npm test && npm run lint && npm run build && npm run test:e2e -- --grep "Copilot" && git diff --check`

Expected: código 0.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools/performance.ts app/actions/classroom-performance.ts app/dashboard/professor/analise/page.tsx app/dashboard/professor/criar/criar-conteudo-client.tsx tests/ai-performance.test.ts
git commit -m "feat(copilot): add private aggregate insights and context actions"
```
