# AI Foundation and Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a fundação neutra de provider, persistência, cotas, Qdrant, Langfuse, filas e RAG autorizado sem liberar ainda a interface do Copilot.

**Architecture:** O domínio de IA usa interfaces pequenas e adapters para OpenAI, Qdrant e Langfuse. Postgres registra estado transacional e outbox. Um worker dedicado mantém o índice derivado e todos os acessos aplicam filtros originados da sessão.

**Tech Stack:** TypeScript, OpenAI SDK 7, Qdrant JS client 1.19, Langfuse JS SDK 5, OpenTelemetry, Postgres, BullMQ, Redis, Docker Compose e Node test runner.

---

### Task 1: Dependências, scripts e contratos neutros

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/ai/contracts.ts`
- Create: `tests/ai-contracts.test.ts`

- [ ] **Step 1: Instalar dependências com Node 24**

```bash
npm install openai@7.5.0 @qdrant/js-client-rest@1.19.0 @langfuse/tracing@5.10.1 @langfuse/otel@5.10.1 @langfuse/client@5.10.1 @opentelemetry/sdk-node@0.221.0
```

Esperado: `package.json` e `package-lock.json` mudam sem alterar a versão de Zod existente.

- [ ] **Step 2: Escrever o teste dos contratos**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { citationSchema, copilotResponseSchema, safetyResultSchema } from "../lib/ai/contracts.ts"

test("copilot response requires grounded citations", () => {
  const result = copilotResponseSchema.safeParse({
    text: "A água ferve a 100 °C ao nível do mar.",
    citations: [{ id: "c1", kind: "web", title: "Fonte", url: "https://example.edu", retrievedAt: "2026-08-24T12:00:00Z", excerpt: "A água ferve a 100 °C ao nível do mar." }],
    usage: { inputTokens: 10, outputTokens: 8 },
    safety: { decision: "approved", policyVersion: "2026-08-24" },
  })
  assert.equal(result.success, true)
  assert.equal(citationSchema.safeParse({ id: "c1", kind: "web", title: "x" }).success, false)
  assert.equal(safetyResultSchema.safeParse({ decision: "publish" }).success, false)
})
```

- [ ] **Step 3: Executar o teste e confirmar falha**

Run: `node --test tests/ai-contracts.test.ts`

Expected: FAIL com `ERR_MODULE_NOT_FOUND` para `lib/ai/contracts.ts`.

- [ ] **Step 4: Criar contratos mínimos**

```ts
import { z } from "zod"

const citationBase = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  retrievedAt: z.string().datetime(),
  excerpt: z.string().min(1).max(2000),
})

export const citationSchema = z.discriminatedUnion("kind", [
  citationBase.extend({ kind: z.literal("internal"), url: z.string().startsWith("/") }),
  citationBase.extend({ kind: z.literal("web"), url: z.string().url().startsWith("https://") }),
])

export const safetyResultSchema = z.object({
  decision: z.enum(["approved", "approved_with_warning", "regenerate", "abstain", "blocked", "human_review_required"]),
  policyVersion: z.string().min(1),
  reasonCode: z.string().max(100).optional(),
})

export const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})

export const copilotResponseSchema = z.object({
  text: z.string().min(1),
  citations: z.array(citationSchema),
  usage: usageSchema,
  safety: safetyResultSchema,
})

export type CopilotResponse = z.infer<typeof copilotResponseSchema>
export type Citation = z.infer<typeof citationSchema>

export interface LLMProvider {
  generate(input: { system: string; user: string; tools?: readonly unknown[]; signal?: AbortSignal }): Promise<CopilotResponse>
}

export interface EmbeddingProvider {
  embed(texts: readonly string[]): Promise<readonly number[][]>
}

export interface VectorStore {
  upsert(points: readonly { id: string; vector: readonly number[]; payload: Record<string, unknown> }[]): Promise<void>
  deleteBySource(sourceId: string): Promise<void>
  search(input: { vector: readonly number[]; teacherId: string; classroomId?: string; limit: number }): Promise<readonly Citation[]>
}
```

- [ ] **Step 5: Adicionar script e executar teste**

Adicionar a `package.json`:

```json
"test:ai": "node --test tests/ai-*.test.ts"
```

Run: `npm run test:ai`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/ai/contracts.ts tests/ai-contracts.test.ts
git commit -m "feat(ai): add provider-neutral contracts"
```

### Task 2: Configuração, flags e validação de produção

**Files:**
- Create: `lib/ai/config.ts`
- Modify: `lib/config/production.ts`
- Modify: `.env.docker.example`
- Modify: `.env.production.example`
- Test: `tests/ai-config.test.ts`
- Modify: `tests/production-security.test.ts`

- [ ] **Step 1: Escrever teste de falha fechada**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { aiConfigErrors, readAiConfig } from "../lib/ai/config.ts"

test("disabled AI does not require provider secrets", () => {
  assert.deepEqual(aiConfigErrors({ FEATURE_AI_COPILOT: "false" }), [])
})

test("enabled AI requires OpenAI, Qdrant and Langfuse", () => {
  const errors = aiConfigErrors({ FEATURE_AI_COPILOT: "true" })
  assert.deepEqual(errors, ["OPENAI_API_KEY is required", "QDRANT_URL is required", "QDRANT_API_KEY is required", "LANGFUSE_BASE_URL is required", "LANGFUSE_PUBLIC_KEY is required", "LANGFUSE_SECRET_KEY is required"])
})

test("config applies beta defaults", () => {
  const config = readAiConfig({ FEATURE_AI_COPILOT: "false" })
  assert.equal(config.dailyRequests, 20)
  assert.equal(config.monthlyTokens, 1_000_000)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-config.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar configuração pura**

```ts
type Env = Record<string, string | undefined>

const requiredWhenEnabled = ["OPENAI_API_KEY", "QDRANT_URL", "QDRANT_API_KEY", "LANGFUSE_BASE_URL", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"] as const

export function aiConfigErrors(env: Env): string[] {
  if (env.FEATURE_AI_COPILOT !== "true") return []
  return requiredWhenEnabled.filter((name) => !env[name]?.trim()).map((name) => `${name} is required`)
}

export function readAiConfig(env: Env = process.env) {
  const errors = aiConfigErrors(env)
  if (errors.length) throw new Error(`Invalid AI configuration: ${errors.join(", ")}`)
  return {
    enabled: env.FEATURE_AI_COPILOT === "true",
    webSearch: env.FEATURE_AI_WEB_SEARCH === "true",
    internalRag: env.FEATURE_AI_INTERNAL_RAG === "true",
    model: env.OPENAI_COPILOT_MODEL || "gpt-5-mini",
    embeddingModel: env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    dailyRequests: Number(env.AI_DAILY_REQUEST_LIMIT || "20"),
    monthlyTokens: Number(env.AI_MONTHLY_TOKEN_LIMIT || "1000000"),
  }
}
```

- [ ] **Step 4: Integrar à configuração de produção**

Importar `aiConfigErrors` em `lib/config/production.ts` e adicionar `errors.push(...aiConfigErrors(env))` antes do retorno.

Adicionar aos exemplos de ambiente todas as flags com `false`, limites, modelos e endpoints internos.

- [ ] **Step 5: Executar testes**

Run: `npm run test:ai && npm run test:production-security`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/config.ts lib/config/production.ts .env.docker.example .env.production.example tests/ai-config.test.ts tests/production-security.test.ts
git commit -m "feat(ai): validate feature flags and provider config"
```

### Task 3: Schema transacional da fundação

**Files:**
- Create: `scripts/052_ai_foundation.sql`
- Modify: `scripts/migrate.mjs`
- Create: `tests/ai-schema.test.ts`

- [ ] **Step 1: Escrever teste estrutural da migração**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const sql = readFileSync(new URL("../scripts/052_ai_foundation.sql", import.meta.url), "utf8")
const baseline = readFileSync(new URL("../scripts/200_app_schema_postgres.sql", import.meta.url), "utf8")
const runner = readFileSync(new URL("../scripts/migrate.mjs", import.meta.url), "utf8")

test("AI migration has ownership, quota and immutable draft confirmation", () => {
  for (const table of ["ai_beta_access", "ai_conversations", "ai_messages", "ai_runs", "ai_tool_executions", "ai_citations", "ai_draft_actions", "ai_usage_daily", "ai_documents"]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"))
  }
  assert.match(sql, /payload_hash text not null/i)
  assert.match(sql, /expires_at timestamptz not null/i)
  assert.match(sql, /unique \(teacher_id, usage_date\)/i)
  assert.doesNotMatch(baseline, /052_ai_foundation|public\.ai_beta_access/i)
  assert.equal((runner.match(/\["00560", "ai_foundation", "scripts\/052_ai_foundation\.sql"\]/g) ?? []).length, 1)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-schema.test.ts`

Expected: FAIL por arquivo ausente.

- [ ] **Step 3: Criar migração**

Criar as nove tabelas indicadas no teste, UUIDs com `gen_random_uuid()`, FKs para `profiles`, timestamps UTC, checks dos estados definidos no PRD e índices em `teacher_id`, `conversation_id`, `status`, `created_at` e `expires_at`.

Garantir ownership composto entre professor e turma, triggers de manutenção de `updated_at` e uma função/trigger de banco que torne o conteúdo do draft imutável, valide transições e grave confirmação/aplicação com horário autoritativo do PostgreSQL.

O bloco de cotas deve conter exatamente:

```sql
create table public.ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  reserved_tokens bigint not null default 0 check (reserved_tokens >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (teacher_id, usage_date)
);
```

- [ ] **Step 4: Registrar migração**

Adicionar ao fim de `MIGRATIONS`:

```js
["00560", "ai_foundation", "scripts/052_ai_foundation.sql"],
```

Não alterar `scripts/200_app_schema_postgres.sql`. A migração histórica 00200 é imutável porque o runner valida seu checksum. Toda a fundação de IA pertence exclusivamente à migração 00560.

- [ ] **Step 5: Validar**

Run: `node --test tests/ai-schema.test.ts && npm run db:migrate && npm run db:migrate`

Expected: teste PASS, baseline 00200 sem a seção 052, primeira migração aplicada e segunda execução sem alteração ou checksum mismatch.

- [ ] **Step 6: Commit**

```bash
git add scripts/052_ai_foundation.sql scripts/migrate.mjs tests/ai-schema.test.ts docs/superpowers/plans/2026-08-24-ai-foundation-knowledge.md
git commit -m "fix(ai): preserve migration history and draft integrity"
```

### Task 4: Acesso ao beta e reserva de cota

**Files:**
- Create: `lib/ai/access.ts`
- Create: `tests/ai-access.test.ts`

- [ ] **Step 1: Escrever testes da decisão pura**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { decideAiAccess } from "../lib/ai/access.ts"

const base = { approved: true, betaEnabled: true, featureEnabled: true, requests: 0, requestLimit: 20, tokens: 0, tokenLimit: 1_000_000 }

test("access fails closed", () => {
  assert.equal(decideAiAccess({ ...base, approved: false }).code, "professor_not_approved")
  assert.equal(decideAiAccess({ ...base, betaEnabled: false }).code, "beta_disabled")
  assert.equal(decideAiAccess({ ...base, requests: 20 }).code, "daily_quota_exceeded")
  assert.equal(decideAiAccess({ ...base, tokens: 1_000_000 }).code, "monthly_quota_exceeded")
  assert.equal(decideAiAccess(base).ok, true)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-access.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar decisão e reserva**

Criar `decideAiAccess` como função pura e `reserveAiUsage(client, teacherId, estimatedTokens)` com `INSERT ... ON CONFLICT ... DO UPDATE` e predicados que impeçam ultrapassar limites. A função deve retornar `{ ok: false, code }` quando nenhuma linha for atualizada.

- [ ] **Step 4: Testar**

Run: `npm run test:ai`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/access.ts tests/ai-access.test.ts
git commit -m "feat(ai): enforce beta access and atomic quotas"
```

### Task 5: Qdrant e Langfuse self-hosted

**Files:**
- Create: `docker-compose.ai.yml`
- Modify: `.gitignore`
- Modify: `app/api/health/ready/route.ts`
- Create: `lib/ai/health.ts`
- Create: `tests/ai-infrastructure.test.ts`
- Modify: `tests/production-security.test.ts`
- Modify: `.env.docker.example`
- Modify: `.env.production.example`
- Modify: `docs/superpowers/plans/2026-08-24-ai-foundation-knowledge.md`

- [ ] **Step 1: Escrever teste de fronteira operacional**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

test("AI compose keeps Qdrant and Langfuse private and persistent", () => {
  const compose = readFileSync(new URL("../docker-compose.ai.yml", import.meta.url), "utf8")
  assert.match(compose, /qdrant\/qdrant:/)
  assert.match(compose, /langfuse\/langfuse:/)
  assert.match(compose, /langfuse\/langfuse-worker:/)
  assert.match(compose, /QDRANT__SERVICE__API_KEY/)
  assert.doesNotMatch(compose, /6333:6333/)
  assert.doesNotMatch(compose, /3000:3000/)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-infrastructure.test.ts`

Expected: FAIL por compose ausente.

- [ ] **Step 3: Criar compose de IA**

Usar Qdrant `v1.19.0` e as imagens oficiais Langfuse major 3 fixadas por digest, conforme o compose self-hosted atual. A documentação v4 não é uma tag de imagem. Usar ClickHouse, Postgres, Redis e MinIO exclusivos do Langfuse, todos com versão imutável ou digest. Reutilizar a rede interna do projeto, volumes nomeados e MinIO somente por credencial dedicada. Não publicar portas por padrão. Todos os serviços terão healthcheck, `no-new-privileges` e versões fixas.

As variáveis mínimas serão `QDRANT_API_KEY`, `LANGFUSE_NEXTAUTH_SECRET`, `LANGFUSE_SALT`, `LANGFUSE_ENCRYPTION_KEY`, `LANGFUSE_DB_PASSWORD`, `LANGFUSE_CLICKHOUSE_PASSWORD`, `LANGFUSE_REDIS_PASSWORD`, `LANGFUSE_MINIO_ACCESS_KEY`, `LANGFUSE_MINIO_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY` e `LANGFUSE_SECRET_KEY`.

- [ ] **Step 4: Implementar health condicional**

```ts
export async function checkAiDependenciesReady(env: NodeJS.ProcessEnv = process.env) {
  if (env.FEATURE_AI_COPILOT !== "true") return
  const headers = { "api-key": env.QDRANT_API_KEY! }
  const [qdrant, langfuse] = await Promise.all([
    fetch(`${env.QDRANT_URL}/healthz`, { headers, signal: AbortSignal.timeout(3000) }),
    fetch(`${env.LANGFUSE_BASE_URL}/api/public/health`, { signal: AbortSignal.timeout(3000) }),
  ])
  if (!qdrant.ok || !langfuse.ok) throw new Error("AI dependencies unavailable")
}
```

Chamar essa função no readiness somente quando a flag estiver habilitada.

- [ ] **Step 5: Validar compose e testes**

Run: `node --test tests/ai-infrastructure.test.ts && docker compose -f docker-compose.yml -f docker-compose.ai.yml config --quiet`

Expected: PASS e código 0.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.ai.yml .gitignore app/api/health/ready/route.ts lib/ai/health.ts tests/ai-infrastructure.test.ts tests/production-security.test.ts .env.docker.example .env.production.example docs/superpowers/plans/2026-08-24-ai-foundation-knowledge.md
git commit -m "feat(ai): add private Qdrant and Langfuse services"
```

### Task 6: Adapters OpenAI, Qdrant e Langfuse

**Files:**
- Create: `lib/ai/providers/openai.ts`
- Create: `lib/ai/vector/qdrant.ts`
- Create: `lib/ai/telemetry/langfuse.ts`
- Create: `instrumentation.ts`
- Create: `tests/ai-adapters.test.ts`

- [ ] **Step 1: Escrever testes com clientes falsos**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { OpenAiProvider } from "../lib/ai/providers/openai.ts"
import { NoopTelemetry } from "../lib/ai/telemetry/langfuse.ts"

test("OpenAI adapter maps usage without leaking SDK types", async () => {
  const client = { responses: { create: async () => ({ output_text: "ok", usage: { input_tokens: 4, output_tokens: 2 }, output: [] }) } }
  const provider = new OpenAiProvider(client as never, "test-model")
  const result = await provider.generate({ system: "system", user: "user" })
  assert.equal(result.text, "ok")
  assert.deepEqual(result.usage, { inputTokens: 4, outputTokens: 2 })
})

test("noop telemetry never rejects", async () => {
  await assert.doesNotReject(() => new NoopTelemetry().flush())
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-adapters.test.ts`

Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Implementar adapters**

OpenAI usará `client.responses.create`, timeout de 30 segundos e saídas estruturadas. Qdrant encapsulará `@qdrant/js-client-rest` e sempre exigirá `teacherId`. Langfuse usará SDK v5, `propagateAttributes` e `startActiveObservation`, com input e output sanitizados.

`instrumentation.ts` deverá registrar `LangfuseSpanProcessor` apenas no runtime Node e somente quando as chaves existirem.

- [ ] **Step 4: Executar testes**

Run: `npm run test:ai`

Expected: PASS sem rede.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/providers/openai.ts lib/ai/vector/qdrant.ts lib/ai/telemetry/langfuse.ts instrumentation.ts tests/ai-adapters.test.ts
git commit -m "feat(ai): add OpenAI Qdrant and Langfuse adapters"
```

### Task 7: Documentos, ingestão e filas

**Files:**
- Create: `scripts/053_ai_knowledge.sql`
- Modify: `scripts/migrate.mjs`
- Modify: `lib/queue/contracts.ts`
- Create: `lib/ai/ingestion/chunk.ts`
- Create: `lib/ai/ingestion/events.ts`
- Create: `workers/ai-worker.mjs`
- Modify: `docker-compose.yml`
- Test: `tests/ai-ingestion.test.ts`

- [ ] **Step 1: Escrever teste de chunking determinístico**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { chunkDocument } from "../lib/ai/ingestion/chunk.ts"

test("chunker is deterministic and bounded", () => {
  const text = Array.from({ length: 400 }, (_, index) => `Frase ${index}.`).join(" ")
  const first = chunkDocument(text, { maxChars: 500, overlapChars: 80 })
  const second = chunkDocument(text, { maxChars: 500, overlapChars: 80 })
  assert.deepEqual(first, second)
  assert.ok(first.length > 1)
  assert.ok(first.every((chunk) => chunk.content.length <= 500))
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-ingestion.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar chunking e eventos**

Normalizar HTML com o sanitizador existente, dividir em limites de sentença, gerar `contentHash` SHA-256 e retornar `{ index, content, contentHash }`.

Adicionar às filas:

```ts
"ai.generate",
"ai.ingest",
"ai.embed",
"ai.web-research",
"ai.evaluate",
"ai.delete",
"ai.reconcile",
```

- [ ] **Step 4: Criar worker dedicado**

O worker iniciará consumindo `ai.ingest`, `ai.embed`, `ai.delete` e `ai.reconcile`, reutilizará leasing e DLQ do worker atual e terá `application_name = 'educonnect-ai-worker'`. `ai.ingest` carrega apenas fontes autorizadas, `ai.embed` gera e grava pontos, `ai.delete` remove por `source_id`, e `ai.reconcile` compara hashes. As filas `ai.generate`, `ai.web-research` e `ai.evaluate` ficam registradas no contrato e ganham handlers nos planos seguintes.

- [ ] **Step 5: Registrar migração e serviço**

Adicionar `00570 ai_knowledge` ao migrador. Adicionar serviço `ai-worker` no Compose com as mesmas credenciais mínimas do runtime e sem portas publicadas.

- [ ] **Step 6: Testar**

Run: `npm run test:ai && node --check workers/ai-worker.mjs && docker compose config --quiet`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/053_ai_knowledge.sql scripts/migrate.mjs lib/queue/contracts.ts lib/ai/ingestion workers/ai-worker.mjs docker-compose.yml tests/ai-ingestion.test.ts
git commit -m "feat(ai): add durable knowledge ingestion pipeline"
```

### Task 8: Recuperação híbrida com isolamento

**Files:**
- Create: `lib/ai/retrieval/search.ts`
- Create: `lib/ai/retrieval/authorize.ts`
- Create: `tests/ai-retrieval.test.ts`

- [ ] **Step 1: Escrever teste de filtro obrigatório**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { buildKnowledgeFilter } from "../lib/ai/retrieval/authorize.ts"

test("retrieval filter is derived from trusted access", () => {
  const filter = buildKnowledgeFilter({ teacherId: "teacher-1", allowedClassroomIds: ["room-1"] }, { classroomId: "room-1" })
  assert.deepEqual(filter.must, [
    { key: "teacher_id", match: { value: "teacher-1" } },
    { key: "classroom_id", match: { value: "room-1" } },
    { key: "active", match: { value: true } },
  ])
  assert.throws(() => buildKnowledgeFilter({ teacherId: "teacher-1", allowedClassroomIds: ["room-1"] }, { classroomId: "room-2" }), /classroom_not_allowed/)
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/ai-retrieval.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar filtro e busca**

`buildKnowledgeFilter` aceitará somente um objeto de acesso construído no backend. `searchKnowledge` gerará embedding, executará busca densa e esparsa, aplicará reciprocal rank fusion, limitará a 8 trechos e revalidará `teacher_id`, `classroom_id`, `source_id` e `version` após a resposta.

- [ ] **Step 4: Testar isolamento com adapter falso**

Adicionar ao teste um resultado de `teacher-2` e afirmar que `searchKnowledge` lança `retrieval_scope_violation` em vez de retorná-lo.

Run: `npm run test:ai`

Expected: PASS.

- [ ] **Step 5: Verificação da fase**

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: código 0, sem novos warnings em `lib/ai`, `workers/ai-worker.mjs` ou testes de IA.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/retrieval tests/ai-retrieval.test.ts
git commit -m "feat(ai): add authorized hybrid knowledge retrieval"
```
