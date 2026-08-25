import { z } from "zod"
import { QdrantClient, type QdrantClientParams } from "@qdrant/js-client-rest"
import { citationSchema, type Citation, type EmbeddingProvider } from "../contracts.ts"
import { buildKnowledgeFilter, type TrustedKnowledgeAccess } from "./authorize.ts"
import {
  DENSE_VECTOR_NAME,
  REQUIRED_VECTOR_SCHEMA_VERSION,
  SPARSE_VECTOR_NAME,
  SPARSE_VECTOR_SCHEMA,
  sparseVectorForText,
  validSparseVector,
} from "../../../workers/ai-vector-core.mjs"

const MAX_QUERY_CHARS = 2_000
const MAX_RESULTS = 8
const DEFAULT_CANDIDATES = 24
const RRF_K = 60

export type VectorPoint = Readonly<{
  id?: string | number
  score?: number
  payload?: unknown
}>

export type QueryBatchResponse = readonly Readonly<{ points?: readonly VectorPoint[] }>[]

export type HybridVectorClient = Readonly<{
  queryBatch(
    collection: string,
    request: Readonly<Record<string, unknown>>,
    options?: Readonly<{ signal?: AbortSignal }>
  ): Promise<QueryBatchResponse>
}>

type QdrantLowLevelClient = Readonly<{
  api(): Pick<ReturnType<QdrantClient["api"]>, "queryBatchPoints">
}>

type QdrantClientFactory = (config: QdrantClientParams) => QdrantLowLevelClient

export function qdrantHybridClient(
  config: Readonly<{ url: string; apiKey: string; maxConnections?: number }>,
  createClient: QdrantClientFactory = (options) => new QdrantClient(options)
): HybridVectorClient {
  let url: URL
  try {
    url = new URL(config.url)
  } catch {
    throw new Error("invalid_qdrant_config")
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || !config.apiKey.trim() ||
      (config.maxConnections !== undefined &&
        (!Number.isInteger(config.maxConnections) || config.maxConnections <= 0))) {
    throw new Error("invalid_qdrant_config")
  }
  const client = createClient({
    url: url.toString(),
    apiKey: config.apiKey.trim(),
    maxConnections: config.maxConnections,
    // The SDK timeout middleware replaces RequestInit.signal. NaN disables that
    // middleware so the retrieval deadline signal reaches the underlying fetch.
    timeout: Number.NaN,
    checkCompatibility: false,
  })
  return {
    queryBatch: async (collection, request, options) => {
      try {
        const response = await client.api().queryBatchPoints(
          {
            collection_name: collection,
            ...request,
          } as Parameters<ReturnType<QdrantClient["api"]>["queryBatchPoints"]>[0],
          { signal: options?.signal }
        )
        const result = response.data?.result
        if (!response.ok || !Array.isArray(result)) throw new Error("invalid_qdrant_response")
        return result
      } catch {
        if (options?.signal?.aborted) throw abortError()
        throw new Error("qdrant_retrieval_failed")
      }
    },
  }
}

export type AuthorizedKnowledgeSource = Readonly<{
  tenantId: string
  teacherId: string
  classroomId?: string | null
  sourceId: string
  documentId: string
  version: number
  embeddingModel: string
  embeddingDimensions: number
  vectorSchemaVersion: number
  active: boolean
}>

export type KnowledgeSourceRepository = Readonly<{
  authorize(
    candidate: AuthorizedKnowledgeSource,
    access: TrustedKnowledgeAccess,
    signal?: AbortSignal
  ): Promise<AuthorizedKnowledgeSource | null>
}>

export type KnowledgeSearchConfig = Readonly<{
  collection: string
  embeddingModel: string
  embeddingDimensions: number
  vectorSchemaVersion: number
  timeoutSeconds?: number
  deadlineMs?: number
}>

const payloadSchema = z.object({
  tenant_id: z.string().min(1).max(100),
  teacher_id: z.string().uuid(),
  classroom_id: z.string().uuid().optional(),
  source_id: z.string().trim().min(1).max(500),
  document_id: z.string().uuid(),
  version: z.number().int().positive(),
  embedding_model: z.string().trim().min(1).max(200),
  embedding_dimensions: z.number().int().positive(),
  vector_schema_version: z.number().int().positive(),
  sparse_schema: z.literal(SPARSE_VECTOR_SCHEMA),
  active: z.literal(true),
}).and(citationSchema)

type ParsedCandidate = Readonly<{
  id: string
  score: number
  citation: RetrievalCitation
  source: AuthorizedKnowledgeSource
}>

export type RetrievalCitation = Citation & { contentSourceId?: string }

function abortError(): Error {
  const error = new Error("retrieval_aborted")
  error.name = "AbortError"
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

async function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  throwIfAborted(signal)
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort))
  })
}

function retrievalCancellation(external: AbortSignal | undefined, deadlineMs: number): {
  signal: AbortSignal
  cleanup(): void
} {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (external?.aborted) abort()
  else external?.addEventListener("abort", abort, { once: true })
  const timeout = setTimeout(abort, deadlineMs)
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      external?.removeEventListener("abort", abort)
    },
  }
}

function requireConfig(config: KnowledgeSearchConfig): void {
  if (!config.collection.trim() || !config.embeddingModel.trim() ||
      !Number.isInteger(config.embeddingDimensions) || config.embeddingDimensions <= 0 ||
      config.vectorSchemaVersion !== REQUIRED_VECTOR_SCHEMA_VERSION ||
      (config.timeoutSeconds !== undefined &&
        (!Number.isInteger(config.timeoutSeconds) || config.timeoutSeconds <= 0 || config.timeoutSeconds > 300)) ||
      (config.deadlineMs !== undefined &&
        (!Number.isInteger(config.deadlineMs) || config.deadlineMs <= 0 || config.deadlineMs > 120_000))) {
    throw new Error("invalid_retrieval_config")
  }
}

function parseCandidate(
  point: VectorPoint,
  access: TrustedKnowledgeAccess,
  classroomId: string | undefined,
  config: KnowledgeSearchConfig
): ParsedCandidate | null {
  const id = typeof point.id === "string" || typeof point.id === "number" ? String(point.id) : ""
  if (!id || typeof point.score !== "number" || !Number.isFinite(point.score)) return null
  const parsed = payloadSchema.safeParse(point.payload)
  if (!parsed.success) throw new Error("retrieval_scope_violation")
  const payload = parsed.data
  if (payload.id !== id || payload.tenant_id !== access.tenantId || payload.teacher_id !== access.teacherId ||
      (classroomId !== undefined && payload.classroom_id !== classroomId) ||
      (payload.classroom_id !== undefined && !access.allowedClassroomIds.includes(payload.classroom_id)) ||
      payload.embedding_model !== config.embeddingModel ||
      payload.embedding_dimensions !== config.embeddingDimensions ||
      payload.vector_schema_version !== config.vectorSchemaVersion) {
    throw new Error("retrieval_scope_violation")
  }
  return {
    id,
    score: point.score,
    citation: {
      ...citationSchema.parse(payload),
      contentSourceId: payload.source_id,
    },
    source: {
      tenantId: payload.tenant_id,
      teacherId: payload.teacher_id,
      classroomId: payload.classroom_id,
      sourceId: payload.source_id,
      documentId: payload.document_id,
      version: payload.version,
      embeddingModel: payload.embedding_model,
      embeddingDimensions: payload.embedding_dimensions,
      vectorSchemaVersion: payload.vector_schema_version,
      active: payload.active,
    },
  }
}

function sourceDecision(
  candidate: AuthorizedKnowledgeSource,
  trusted: AuthorizedKnowledgeSource
): "authorized" | "stale" {
  if (trusted.tenantId !== candidate.tenantId || trusted.teacherId !== candidate.teacherId ||
      (trusted.classroomId ?? null) !== (candidate.classroomId ?? null) ||
      trusted.sourceId !== candidate.sourceId || trusted.documentId !== candidate.documentId ||
      trusted.embeddingModel !== candidate.embeddingModel ||
      trusted.embeddingDimensions !== candidate.embeddingDimensions ||
      trusted.vectorSchemaVersion !== candidate.vectorSchemaVersion ||
      trusted.version < candidate.version) {
    throw new Error("retrieval_scope_violation")
  }
  if (!trusted.active || trusted.version > candidate.version) return "stale"
  return "authorized"
}

export function reciprocalRankFusion(
  lists: readonly (readonly VectorPoint[])[],
  limit: number,
  rankConstant = RRF_K
): readonly Readonly<{ id: string; score: number }>[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS ||
      !Number.isFinite(rankConstant) || rankConstant <= 0) {
    throw new Error("invalid_retrieval_limit")
  }
  const fused = new Map<string, { id: string; score: number; bestRank: number }>()
  for (const list of lists) {
    if (!Array.isArray(list)) throw new Error("invalid_qdrant_response")
    const seen = new Set<string>()
    let validRank = 0
    for (const point of list) {
      if ((typeof point?.id !== "string" && typeof point?.id !== "number") ||
          typeof point.score !== "number" || !Number.isFinite(point.score)) continue
      const id = String(point.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      validRank += 1
      const current = fused.get(id) ?? { id, score: 0, bestRank: validRank }
      current.score += 1 / (rankConstant + validRank)
      current.bestRank = Math.min(current.bestRank, validRank)
      fused.set(id, current)
    }
  }
  return [...fused.values()]
    .sort((left, right) => right.score - left.score || left.bestRank - right.bestRank || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map(({ id, score }) => ({ id, score }))
}

async function searchKnowledgeWithSignal(
  input: Readonly<{
    access: TrustedKnowledgeAccess
    query: string
    classroomId?: string
    limit?: number
    signal?: AbortSignal
  }>,
  dependencies: Readonly<{
    embeddingProvider: EmbeddingProvider
    vectorClient: HybridVectorClient
    sourceRepository: KnowledgeSourceRepository
    config: KnowledgeSearchConfig
  }>
): Promise<readonly RetrievalCitation[]> {
  const query = typeof input.query === "string" ? input.query.trim() : ""
  if (!query || query.length > MAX_QUERY_CHARS) throw new Error("invalid_retrieval_query")
  const limit = Math.min(input.limit ?? MAX_RESULTS, MAX_RESULTS)
  if (!Number.isInteger(limit) || limit < 1) throw new Error("invalid_retrieval_limit")
  const filter = buildKnowledgeFilter(input.access, { classroomId: input.classroomId })
  const access: TrustedKnowledgeAccess = {
    tenantId: String(filter.must[0]?.match.value),
    teacherId: input.access.teacherId,
    allowedClassroomIds: [...input.access.allowedClassroomIds],
  }
  throwIfAborted(input.signal)

  const embeddings = await withAbort(
    dependencies.embeddingProvider.embed([query], input.signal),
    input.signal
  )
  throwIfAborted(input.signal)
  const dense = embeddings[0]
  if (embeddings.length !== 1 || !Array.isArray(dense) || dense.length !== dependencies.config.embeddingDimensions ||
      dense.some((value) => !Number.isFinite(value))) {
    throw new Error("invalid_embedding_response")
  }
  const sparse = sparseVectorForText(query)
  if (!validSparseVector(sparse)) throw new Error("invalid_sparse_vector")
  const candidateLimit = Math.max(DEFAULT_CANDIDATES, limit * 3)
  const common = { filter, limit: candidateLimit, with_payload: true, with_vector: false }
  const request = {
    timeout: dependencies.config.timeoutSeconds ?? 30,
    searches: [
      { ...common, query: [...dense], using: DENSE_VECTOR_NAME },
      { ...common, query: sparse, using: SPARSE_VECTOR_NAME },
    ],
  }
  const response = await withAbort(
    dependencies.vectorClient.queryBatch(
      dependencies.config.collection,
      request,
      { signal: input.signal }
    ),
    input.signal
  )
  if (!Array.isArray(response) || response.length !== 2 ||
      response.some((result) => !result || !Array.isArray(result.points))) {
    throw new Error("invalid_qdrant_response")
  }

  const parsedById = new Map<string, ParsedCandidate>()
  const rawLists = response.map((result) => result.points ?? [])
  for (const list of rawLists) {
    for (const point of list) {
      const parsed = parseCandidate(point, access, input.classroomId, dependencies.config)
      if (parsed) parsedById.set(parsed.id, parsed)
    }
  }
  const ranked = reciprocalRankFusion(rawLists, limit)
  const citations: Citation[] = []
  for (const rank of ranked) {
    throwIfAborted(input.signal)
    const candidate = parsedById.get(rank.id)
    if (!candidate) continue
    const trusted = await withAbort(
      dependencies.sourceRepository.authorize(candidate.source, access, input.signal),
      input.signal
    )
    throwIfAborted(input.signal)
    if (!trusted || sourceDecision(candidate.source, trusted) === "stale") continue
    citations.push(candidate.citation)
  }
  return citations
}

export async function searchKnowledge(
  input: Readonly<{
    access: TrustedKnowledgeAccess
    query: string
    classroomId?: string
    limit?: number
    signal?: AbortSignal
  }>,
  dependencies: Readonly<{
    embeddingProvider: EmbeddingProvider
    vectorClient: HybridVectorClient
    sourceRepository: KnowledgeSourceRepository
    config: KnowledgeSearchConfig
  }>
): Promise<readonly Citation[]> {
  requireConfig(dependencies.config)
  const cancellation = retrievalCancellation(
    input.signal,
    dependencies.config.deadlineMs ?? 10_000
  )
  try {
    return await searchKnowledgeWithSignal(
      { ...input, signal: cancellation.signal },
      dependencies
    )
  } finally {
    cancellation.cleanup()
  }
}
