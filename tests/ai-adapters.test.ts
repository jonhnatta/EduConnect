import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  OpenAiEmbeddingProvider,
  OpenAiProvider,
} from "../lib/ai/providers/openai.ts"
import {
  LangfuseTelemetry,
  NoopTelemetry,
  sanitizeTelemetryValue,
} from "../lib/ai/telemetry/langfuse.ts"
import { QdrantVectorStore } from "../lib/ai/vector/qdrant.ts"
import {
  registerLangfuseInstrumentation,
  shouldRegisterLangfuse,
} from "../instrumentation.ts"

const teacherId = "b1f5cfd8-9bba-4ff8-8775-78901d802de8"
const classroomId = "d62c4498-c421-463a-b2bb-3b8802631ac9"
const citation = {
  kind: "internal" as const,
  id: "chunk-1",
  title: "Material de matemática",
  url: "/materiais/1",
  retrievedAt: "2026-08-24T12:00:00.000Z",
  excerpt: "A soma dos ângulos internos de um triângulo é 180 graus.",
}
const modelOutput = {
  text: "A soma é 180 graus.",
  citations: [citation],
  safety: { decision: "approved" as const, policyVersion: "2026-08-24", reasonCode: null },
}

test("OpenAI adapter requests strict structured output and maps real usage", async () => {
  const calls: unknown[][] = []
  const signal = AbortSignal.timeout(5_000)
  const client = {
    responses: {
      create: async (...args: unknown[]) => {
        calls.push(args)
        return {
          output_text: JSON.stringify(modelOutput),
          usage: { input_tokens: 4, output_tokens: 2 },
        }
      },
    },
  }
  const provider = new OpenAiProvider(client, "test-model")

  const result = await provider.generate({
    system: "system",
    user: "user",
    signal,
  })

  assert.deepEqual(result, {
    ...modelOutput,
    safety: { decision: "approved", policyVersion: "2026-08-24" },
    usage: { inputTokens: 4, outputTokens: 2 },
  })
  const [request, options] = calls[0] as [Record<string, unknown>, Record<string, unknown>]
  assert.equal(request.model, "test-model")
  assert.equal(request.instructions, "system")
  assert.equal(request.input, "user")
  assert.equal(request.store, false)
  assert.equal((request.text as { format: { type: string; strict: boolean } }).format.type, "json_schema")
  assert.equal((request.text as { format: { type: string; strict: boolean } }).format.strict, true)
  assert.deepEqual(options, { timeout: 30_000, maxRetries: 0, signal })
})

test("OpenAI adapter validates tools without mutating caller input", async () => {
  let request: Record<string, unknown> | undefined
  const tool = Object.freeze({ type: "web_search", search_context_size: "low" })
  const tools = Object.freeze([tool])
  const provider = new OpenAiProvider(
    {
      responses: {
        create: async (input: unknown) => {
          request = input as Record<string, unknown>
          return {
            output_text: JSON.stringify(modelOutput),
            usage: { input_tokens: 1, output_tokens: 1 },
          }
        },
      },
    },
    "test-model"
  )

  await provider.generate({ system: "s", user: "u", tools })
  assert.deepEqual(request?.tools, [tool])
  assert.notEqual(request?.tools, tools)
  await assert.rejects(
    provider.generate({ system: "s", user: "u", tools: [{ type: " " }] }),
    /invalid_tool/
  )
  await assert.rejects(
    provider.generate({ system: "s", user: "u", tools: [{ type: "unsupported" }] }),
    /invalid_tool/
  )
  await assert.rejects(
    provider.generate({ system: "s", user: "u", tools: [{ type: "function" }] }),
    /invalid_tool/
  )
  await assert.rejects(
    provider.generate({ system: "s", user: "u", tools: [{ type: "file_search" }] }),
    /invalid_tool/
  )
  await assert.rejects(
    provider.generate({
      system: "s",
      user: "u",
      tools: [{ type: "web_search", search_context_size: "bogus" }],
    }),
    /invalid_tool/
  )
})

test("OpenAI adapter fails closed with sanitized parsing errors", async () => {
  const secretOutput = "RAW-SECRET-model-output"
  const cases = [
    { output_text: secretOutput, usage: { input_tokens: 1, output_tokens: 1 } },
    { output_text: "", usage: { input_tokens: 1, output_tokens: 1 } },
    { output_text: JSON.stringify(modelOutput), usage: undefined },
    {
      output_text: JSON.stringify({ ...modelOutput, citations: [] }),
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  ]

  for (const response of cases) {
    const provider = new OpenAiProvider(
      { responses: { create: async () => response } },
      "test-model"
    )
    await assert.rejects(provider.generate({ system: "s", user: "u" }), (error) => {
      assert.ok(error instanceof Error)
      assert.doesNotMatch(error.message, /RAW-SECRET/)
      assert.match(error.message, /invalid_openai_response/)
      return true
    })
  }
})

test("OpenAI adapter allows safe refusals without citations", async () => {
  const provider = new OpenAiProvider(
    {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            text: "Não posso ajudar com isso.",
            citations: [],
            safety: { decision: "blocked", policyVersion: "2026-08-24", reasonCode: null },
          }),
          usage: { input_tokens: 2, output_tokens: 3 },
        }),
      },
    },
    "test-model"
  )
  assert.equal((await provider.generate({ system: "s", user: "u" })).safety.decision, "blocked")
})

test("embedding adapter preserves index order and validates dimensions", async () => {
  const calls: unknown[][] = []
  const signal = AbortSignal.timeout(5_000)
  const provider = new OpenAiEmbeddingProvider(
    {
      embeddings: {
        create: async (...args: unknown[]) => {
          calls.push(args)
          return { data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }] }
        },
      },
    },
    "embedding-model"
  )

  assert.deepEqual(await provider.embed(["first", "second"], signal), [[1, 2], [3, 4]])
  assert.deepEqual(calls[0], [
    { model: "embedding-model", input: ["first", "second"] },
    { timeout: 30_000, maxRetries: 0, signal },
  ])
  assert.deepEqual(await provider.embed([]), [])

  const invalid = new OpenAiEmbeddingProvider(
    { embeddings: { create: async () => ({ data: [{ index: 0, embedding: [1, Number.NaN] }] }) } },
    "embedding-model"
  )
  await assert.rejects(invalid.embed(["x"]), /invalid_embedding_response/)
})

test("Qdrant upsert validates tenant payload before writing", async () => {
  const calls: unknown[][] = []
  const store = new QdrantVectorStore(
    { upsert: async (...args: unknown[]) => void calls.push(args), query: async () => ({ points: [] }), delete: async () => ({}) },
    "knowledge"
  )
  const point = {
    id: "9568440d-e0dd-45ba-a544-355fbe6358e0",
    vector: [0.1, 0.2],
    payload: { ...citation, teacher_id: teacherId, classroom_id: classroomId, source_id: "source-1", active: true },
  }

  await store.upsert([point])
  assert.deepEqual(calls[0], ["knowledge", { wait: true, points: [point] }])
  await assert.rejects(
    store.upsert([{ ...point, payload: { ...point.payload, teacher_id: "not-a-uuid" } }]),
    /invalid_qdrant_point/
  )
  assert.equal(calls.length, 1)
})

test("Qdrant rejects point ids unsupported by the real service", async () => {
  let writes = 0
  const store = new QdrantVectorStore(
    { upsert: async () => { writes += 1 }, query: async () => ({ points: [] }), delete: async () => ({}) },
    "knowledge"
  )
  await assert.rejects(store.upsert([{
    id: "point-1",
    vector: [0.1],
    payload: { ...citation, teacher_id: teacherId, source_id: "source-1", active: true },
  }]), /invalid_qdrant_point/)
  assert.equal(writes, 0)
})

test("Qdrant search enforces tenant filters and revalidates response scope", async () => {
  const calls: unknown[][] = []
  const validPayload = { ...citation, teacher_id: teacherId, classroom_id: classroomId, source_id: "source-1", active: true }
  const client = {
    upsert: async () => ({}),
    delete: async () => ({}),
    query: async (...args: unknown[]) => {
      calls.push(args)
      return { points: [{ id: "point-1", payload: validPayload }] }
    },
  }
  const store = new QdrantVectorStore(client, "knowledge")

  assert.deepEqual(await store.search({ vector: [0.1], teacherId, classroomId, limit: 8 }), [citation])
  assert.deepEqual(calls[0], ["knowledge", {
    query: [0.1],
    filter: { must: [
      { key: "teacher_id", match: { value: teacherId } },
      { key: "active", match: { value: true } },
      { key: "classroom_id", match: { value: classroomId } },
    ] },
    limit: 8,
    with_payload: true,
  }])

  client.query = async () => ({ points: [{ id: "bad", payload: { ...validPayload, teacher_id: "47b608d8-0ea1-4826-b088-eb29c2dd948b" } }] })
  await assert.rejects(
    store.search({ vector: [0.1], teacherId, classroomId, limit: 8 }),
    /retrieval_scope_violation/
  )
})

test("Qdrant deletion is tenant safe", async () => {
  const calls: unknown[][] = []
  const store = new QdrantVectorStore(
    { upsert: async () => ({}), query: async () => ({ points: [] }), delete: async (...args: unknown[]) => { calls.push(args); return {} } },
    "knowledge"
  )
  await store.deleteBySource("source-1", teacherId)
  assert.deepEqual(calls[0], ["knowledge", {
    wait: true,
    filter: { must: [
      { key: "teacher_id", match: { value: teacherId } },
      { key: "source_id", match: { value: "source-1" } },
    ] },
  }])
})

test("telemetry sanitizes secrets, emails, cycles and oversized values", () => {
  const cyclic: Record<string, unknown> = { email: "teacher@example.com", apiKey: "sk-live", nested: { answerKey: "B" } }
  cyclic.self = cyclic
  const sanitized = sanitizeTelemetryValue(cyclic) as Record<string, unknown>
  assert.equal(sanitized.email, "[email-redacted]")
  assert.equal(sanitized.apiKey, "[redacted]")
  assert.deepEqual(sanitized.nested, { answerKey: "[redacted]" })
  assert.equal(sanitized.self, "[circular]")
  assert.ok(JSON.stringify(sanitizeTelemetryValue("x".repeat(20_000))).length < 9_000)
  assert.equal(sanitizeTelemetryValue(AbortSignal.timeout(10)), "[unsupported]")
  assert.equal(sanitizeTelemetryValue(new Error("secret raw error")), "[error-redacted]")

  const hostile = Object.defineProperty({}, "unsafe", {
    enumerable: true,
    get() { throw new Error("raw getter secret") },
  })
  assert.doesNotThrow(() => sanitizeTelemetryValue(hostile))
})

test("Noop and Langfuse telemetry execute callbacks without exposing secrets", async () => {
  const noop = new NoopTelemetry()
  assert.equal(await noop.trace({ name: "trace" }, async () => 42), 42)
  assert.equal(await noop.wrap({ name: "generation" }, async () => 43), 43)
  await assert.doesNotReject(() => noop.flush())

  const observations: unknown[] = []
  const propagated: unknown[] = []
  const telemetry = new LangfuseTelemetry({
    propagateAttributes: (attributes, callback) => { propagated.push(attributes); return callback() },
    startActiveObservation: (name, callback, options) => {
      observations.push({ name, options })
      return callback({ update: (value: unknown) => observations.push(value) })
    },
    flush: async () => undefined,
  })
  const result = await telemetry.wrap(
    { name: "answer", input: { authorization: "Bearer secret", email: "teacher@example.com" }, metadata: { token: "hidden" } },
    async () => ({ output: "teacher@example.com", password: "hidden" })
  )
  assert.deepEqual(result, { output: "teacher@example.com", password: "hidden" })
  const exported = JSON.stringify({ observations, propagated })
  assert.doesNotMatch(exported, /Bearer secret|teacher@example\.com|hidden/)
  assert.match(exported, /\[redacted\]|\[email-redacted\]/)
})

test("instrumentation gates Node runtime and valid credentials", async () => {
  const validEnv = {
    NEXT_RUNTIME: "nodejs",
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
    LANGFUSE_BASE_URL: "https://langfuse.example.com",
  }
  assert.equal(shouldRegisterLangfuse(validEnv), true)
  assert.equal(shouldRegisterLangfuse({ ...validEnv, NEXT_RUNTIME: "edge" }), false)
  assert.equal(shouldRegisterLangfuse({ ...validEnv, LANGFUSE_SECRET_KEY: " " }), false)
  assert.equal(shouldRegisterLangfuse({ ...validEnv, LANGFUSE_BASE_URL: "invalid" }), false)

  let loads = 0
  let starts = 0
  const registry = {}
  const load = async () => {
    loads += 1
    return {
      NodeSDK: class { start() { starts += 1 } },
      LangfuseSpanProcessor: class {},
      sanitizeTelemetryValue: (value: unknown) => value,
    }
  }
  await registerLangfuseInstrumentation(validEnv, load, registry)
  await registerLangfuseInstrumentation(validEnv, load, registry)
  assert.equal(loads, 1)
  assert.equal(starts, 1)
})

test("Next register has a statically eliminable Edge gate before Node imports", () => {
  const source = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8")
  assert.match(
    source,
    /export async function register\(\): Promise<void> \{\s+if \(process\.env\.NEXT_RUNTIME !== "nodejs"\) return/
  )
})
