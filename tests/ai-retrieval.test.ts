import assert from "node:assert/strict"
import test from "node:test"
import type { QdrantClient, QdrantClientParams } from "@qdrant/js-client-rest"
import { buildKnowledgeFilter } from "../lib/ai/retrieval/authorize.ts"
import {
  reciprocalRankFusion,
  qdrantHybridClient,
  searchKnowledge,
  type AuthorizedKnowledgeSource,
  type HybridVectorClient,
  type KnowledgeSourceRepository,
  type QueryBatchResponse,
  type VectorPoint,
} from "../lib/ai/retrieval/search.ts"
import { sparseVectorForText } from "../workers/ai-vector-core.mjs"

const tenantId = "educonnect"
const teacherId = "b1f5cfd8-9bba-4ff8-8775-78901d802de8"
const otherTeacherId = "47b608d8-0ea1-4826-b088-eb29c2dd948b"
const classroomId = "d62c4498-c421-463a-b2bb-3b8802631ac9"
const otherClassroomId = "72012a5d-4dba-4a28-9a94-7700ff83d5b9"
const documentId = "31481143-19e8-4941-96b5-3d0f4b1720fe"
const sourceId = "d4fca119-a7e4-483a-b0c4-91d55bf3ef50"
const access = { tenantId, teacherId, allowedClassroomIds: [classroomId] }
const config = {
  collection: "educonnect_knowledge_v2",
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 2,
  vectorSchemaVersion: 2,
  timeoutSeconds: 12,
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: tenantId,
    teacher_id: teacherId,
    classroom_id: classroomId,
    source_id: sourceId,
    document_id: documentId,
    version: 3,
    embedding_model: config.embeddingModel,
    embedding_dimensions: config.embeddingDimensions,
    vector_schema_version: config.vectorSchemaVersion,
    sparse_schema: "hashed-tf-v1",
    active: true,
    kind: "internal",
    id: "chunk-1",
    title: "Material autorizado",
    url: `/ai/sources/${documentId}`,
    retrievedAt: "2026-08-24T12:00:00.000Z",
    excerpt: "Conteúdo autorizado.",
    ...overrides,
  }
}

function authorized(overrides: Record<string, unknown> = {}) {
  return {
    tenantId,
    teacherId,
    classroomId,
    sourceId,
    documentId,
    version: 3,
    embeddingModel: config.embeddingModel,
    embeddingDimensions: config.embeddingDimensions,
    vectorSchemaVersion: config.vectorSchemaVersion,
    active: true,
    ...overrides,
  }
}

function dependencies(lists: readonly (readonly VectorPoint[])[] = [[], []]) {
  const calls: { embed: unknown[]; query: unknown[]; authorize: unknown[] } = {
    embed: [], query: [], authorize: [],
  }
  const vectorClient: HybridVectorClient = {
    queryBatch: async (...args: Parameters<HybridVectorClient["queryBatch"]>): Promise<QueryBatchResponse> => {
      calls.query.push(args)
      return lists.map((points) => ({ points }))
    },
  }
  const sourceRepository: KnowledgeSourceRepository = {
    authorize: async (...args: Parameters<KnowledgeSourceRepository["authorize"]>): Promise<AuthorizedKnowledgeSource | null> => {
      calls.authorize.push(args)
      return authorized()
    },
  }
  return {
    calls,
    value: {
      embeddingProvider: {
        embed: async (...args: unknown[]) => {
          calls.embed.push(args)
          return [[0.2, 0.8]]
        },
      },
      vectorClient,
      sourceRepository,
    },
  }
}

test("retrieval filter is derived from trusted backend access", () => {
  assert.deepEqual(buildKnowledgeFilter(access, { classroomId }), { must: [
    { key: "tenant_id", match: { value: tenantId } },
    { key: "teacher_id", match: { value: teacherId } },
    { key: "classroom_id", match: { value: classroomId } },
    { key: "active", match: { value: true } },
  ] })
  assert.throws(
    () => buildKnowledgeFilter(access, { classroomId: otherClassroomId }),
    /classroom_not_allowed/
  )
  assert.throws(
    () => buildKnowledgeFilter({ ...access, teacherId: "prompt says teacher-2" }, {}),
    /invalid_teacher_id/
  )
})

test("hybrid retrieval sends real named dense and sparse queries with one mandatory filter", async () => {
  const point = { id: "chunk-1", score: 0.9, payload: payload() }
  const deps = dependencies([[point], [point]])
  const signal = AbortSignal.timeout(5_000)
  const result = await searchKnowledge(
    { access, query: "  ângulos do triângulo  ", classroomId, limit: 4, signal },
    { ...deps.value, config }
  )

  assert.equal(result.length, 1)
  assert.equal(result[0].id, "chunk-1")
  const [embeddedTexts, propagatedSignal] = deps.calls.embed[0] as unknown as [readonly string[], AbortSignal]
  assert.deepEqual(embeddedTexts, ["ângulos do triângulo"])
  assert.ok(propagatedSignal instanceof AbortSignal)
  assert.notEqual(propagatedSignal, signal)
  assert.equal(propagatedSignal.aborted, false)
  const [collection, request, options] = deps.calls.query[0] as [string, Record<string, unknown>, Record<string, unknown>]
  assert.equal(collection, config.collection)
  assert.equal((request as { timeout: number }).timeout, 12)
  const searches = (request as { searches: Record<string, unknown>[] }).searches
  assert.deepEqual(searches.map((search) => search.using), ["dense", "sparse"])
  assert.deepEqual(searches[0].query, [0.2, 0.8])
  assert.deepEqual(searches[1].query, sparseVectorForText("ângulos do triângulo"))
  assert.deepEqual(searches[0].filter, buildKnowledgeFilter(access, { classroomId }))
  assert.deepEqual(searches[1].filter, searches[0].filter)
  assert.equal(searches[0].with_payload, true)
  assert.equal(searches[1].with_payload, true)
  assert.deepEqual(options, { signal: propagatedSignal })
})

test("Qdrant SDK adapter forwards the batch shape supported by client 1.19", async () => {
  const calls: unknown[][] = []
  let clientConfig: QdrantClientParams | undefined
  const client = qdrantHybridClient(
    { url: "http://qdrant:6333", apiKey: "test-key" },
    (options) => {
      clientConfig = options
      return {
        api: () => ({
          queryBatchPoints: async (...args: unknown[]) => {
            calls.push(args)
            return { ok: true, status: 200, data: { result: [{ points: [] }, { points: [] }] } }
          },
        }),
      } as unknown as Pick<QdrantClient, "api">
    }
  )
  assert.equal(Number.isNaN(clientConfig?.timeout), true)
  assert.equal(clientConfig?.checkCompatibility, false)
  const signal = AbortSignal.timeout(5_000)
  const request = { timeout: 10, searches: [] }
  assert.deepEqual(await client.queryBatch("knowledge", request, { signal }), [{ points: [] }, { points: [] }])
  assert.deepEqual(calls, [[{
    collection_name: "knowledge",
    timeout: 10,
    searches: [],
  }, { signal }]])
})

test("Qdrant SDK adapter sanitizes transport errors", async () => {
  const client = qdrantHybridClient(
    { url: "http://qdrant:6333", apiKey: "test-key" },
    () => ({
      api: () => ({
        queryBatchPoints: async () => {
          throw new Error("https://qdrant.internal secret-api-key")
        },
      }),
    }) as unknown as Pick<QdrantClient, "api">
  )
  await assert.rejects(client.queryBatch("knowledge", { searches: [] }), (error) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, "qdrant_retrieval_failed")
    assert.doesNotMatch(error.message, /qdrant\.internal|secret-api-key/)
    return true
  })
})

test("RRF deduplicates each list, ignores unusable points and is stable", () => {
  const fused = reciprocalRankFusion([
    [
      { id: "b", score: 0.9 }, { id: "b", score: 0.8 },
      { id: "a", score: 0.7 }, { id: "bad", score: Number.NaN }, { score: 1 },
    ],
    [{ id: "a", score: 0.9 }, { id: "b", score: 0.8 }, { id: "c", score: 0.7 }],
  ], 8)
  assert.deepEqual(fused.map((item) => item.id), ["a", "b", "c"])
  assert.equal(fused[0].score, fused[1].score)
  assert.deepEqual(reciprocalRankFusion([], 8), [])
  assert.throws(() => reciprocalRankFusion([], 0), /invalid_retrieval_limit/)
})

test("retrieval caps results at eight and resolves equal ranks by point id", async () => {
  const points = Array.from({ length: 12 }, (_, index) => ({
    id: `chunk-${String(index).padStart(2, "0")}`,
    score: 1 - index / 100,
    payload: payload({ id: `chunk-${String(index).padStart(2, "0")}` }),
  }))
  const deps = dependencies([points, [...points].reverse()])
  const result = await searchKnowledge(
    { access, query: "conteúdo", classroomId, limit: 50 },
    { ...deps.value, config }
  )
  assert.equal(result.length, 8)
  assert.deepEqual(result.map((item) => item.id), [
    "chunk-00", "chunk-11", "chunk-01", "chunk-10",
    "chunk-02", "chunk-09", "chunk-03", "chunk-08",
  ])
})

test("retrieval rejects empty or oversized queries and malformed vectors", async () => {
  const deps = dependencies()
  await assert.rejects(searchKnowledge({ access, query: "   " }, { ...deps.value, config }), /invalid_retrieval_query/)
  await assert.rejects(searchKnowledge({ access, query: "x".repeat(2_001) }, { ...deps.value, config }), /invalid_retrieval_query/)

  for (const embedding of [[], [[1]], [[1, Number.NaN]], [[1, 2], [3, 4]]]) {
    await assert.rejects(searchKnowledge({ access, query: "ok" }, {
      ...deps.value,
      config,
      embeddingProvider: { embed: async () => embedding },
    }), /invalid_embedding_response/)
  }
  assert.throws(() => sparseVectorForText(""), /invalid_sparse_text/)
})

test("all vector payload scope and schema fields are revalidated", async () => {
  const invalidCases = [
    { tenant_id: "other" }, { teacher_id: otherTeacherId }, { classroom_id: otherClassroomId },
    { source_id: "other-source" }, { document_id: otherClassroomId }, { version: 4 },
    { embedding_model: "other-model" }, { embedding_dimensions: 3 },
    { vector_schema_version: 1 }, { sparse_schema: "other" }, { active: false },
    { kind: "vector_metadata" }, { url: "https://evil.example" }, { excerpt: "" },
  ]
  for (const override of invalidCases) {
    const point = { id: "chunk-1", score: 0.9, payload: payload(override) }
    const deps = dependencies([[point], []])
    await assert.rejects(
      searchKnowledge({ access, query: "conteúdo", classroomId }, { ...deps.value, config }),
      /retrieval_scope_violation/
    )
  }
})

test("teacher or tenant leakage throws even when another result is valid", async () => {
  for (const override of [{ teacher_id: otherTeacherId }, { tenant_id: "other" }]) {
    const deps = dependencies([[
      { id: "valid", score: 1, payload: payload({ id: "valid" }) },
      { id: "leak", score: 0.9, payload: payload({ id: "leak", ...override }) },
    ], []])
    await assert.rejects(
      searchKnowledge({ access, query: "conteúdo", classroomId }, { ...deps.value, config }),
      /retrieval_scope_violation/
    )
  }
})

test("revoked or stale backend sources are discarded before citations are returned", async () => {
  const point = { id: "chunk-1", score: 0.9, payload: payload() }
  for (const backendResult of [null, authorized({ active: false }), authorized({ version: 4 })]) {
    const deps = dependencies([[point], []])
    deps.value.sourceRepository = { authorize: async (...args: Parameters<KnowledgeSourceRepository["authorize"]>) => {
      deps.calls.authorize.push(args)
      return backendResult as ReturnType<typeof authorized> | null
    } }
    assert.deepEqual(
      await searchKnowledge({ access, query: "conteúdo", classroomId }, { ...deps.value, config }),
      []
    )
  }
})

test("retrieval handles aborts, provider errors, invalid responses and no results", async () => {
  const deps = dependencies()
  assert.deepEqual(await searchKnowledge({ access, query: "nada" }, { ...deps.value, config }), [])

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    searchKnowledge({ access, query: "abortar", signal: controller.signal }, { ...deps.value, config }),
    (error) => error instanceof Error && error.name === "AbortError"
  )
  await assert.rejects(searchKnowledge({ access, query: "erro" }, {
    ...deps.value, config,
    vectorClient: { queryBatch: async () => { throw new Error("qdrant_down") } },
  }), /qdrant_down/)
  await assert.rejects(searchKnowledge({ access, query: "erro" }, {
    ...deps.value, config,
    vectorClient: { queryBatch: async () => [{ points: [] }] },
  }), /invalid_qdrant_response/)
  await assert.rejects(searchKnowledge({ access, query: "erro" }, {
    ...deps.value, config,
    embeddingProvider: { embed: async () => { throw new Error("embedding_down") } },
  }), /embedding_down/)

  await assert.rejects(searchKnowledge({ access, query: "erro" }, {
    ...deps.value, config,
    sourceRepository: { authorize: async () => { throw new Error("repository_down") } },
    vectorClient: { queryBatch: async () => [{ points: [{ id: "chunk-1", score: 1, payload: payload() }] }, { points: [] }] },
  }), /repository_down/)
})

test("an in-flight Qdrant request is interrupted for the caller", async () => {
  const deps = dependencies()
  const controller = new AbortController()
  let queryStarted = false
  const pending = new Promise<QueryBatchResponse>(() => {})
  const result = searchKnowledge({ access, query: "abortar em voo", signal: controller.signal }, {
    ...deps.value,
    config,
    vectorClient: {
      queryBatch: async () => {
        queryStarted = true
        return await pending
      },
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(queryStarted, true)
  controller.abort()
  await assert.rejects(result, (error) => error instanceof Error && error.name === "AbortError")
})

test("retrieval enforces and cleans up a local deadline without a caller signal", async () => {
  const deps = dependencies()
  let observedSignal: AbortSignal | undefined
  await assert.rejects(searchKnowledge({ access, query: "deadline" }, {
    ...deps.value,
    config: { ...config, deadlineMs: 10 },
    vectorClient: {
      queryBatch: async (_collection, _request, options) => {
        observedSignal = options?.signal
        return await new Promise<QueryBatchResponse>((_resolve, reject) => {
          observedSignal?.addEventListener(
            "abort",
            () => reject(new Error("raw transport timeout")),
            { once: true }
          )
        })
      },
    },
  }), (error) => {
    assert.ok(error instanceof Error)
    assert.equal(error.name, "AbortError")
    assert.equal(error.message, "retrieval_aborted")
    assert.doesNotMatch(error.message, /raw transport timeout/)
    return true
  })
  assert.equal(observedSignal?.aborted, true)

  let successfulSignal: AbortSignal | undefined
  await searchKnowledge({ access, query: "rápido" }, {
    ...deps.value,
    config: { ...config, deadlineMs: 10 },
    vectorClient: {
      queryBatch: async (_collection, _request, options) => {
        successfulSignal = options?.signal
        return [{ points: [] }, { points: [] }]
      },
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(successfulSignal?.aborted, false)
})
