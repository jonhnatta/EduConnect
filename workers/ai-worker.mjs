import { randomUUID } from "node:crypto"
import { Worker } from "bullmq"
import OpenAI from "openai"
import pg from "pg"
import { QdrantClient } from "@qdrant/js-client-rest"
import {
  chunkNormalizedDocument,
  collectQdrantPages,
  documentJobMatchesCurrent,
  hashContent,
  normalizeDocumentText,
  parseAiQueuePayload,
  partitionAuthorizedDocuments,
  planReconciliation,
} from "./ai-ingestion-core.mjs"
import { log, logError, redisConnection } from "./runtime.mjs"

const databaseUrl = process.env.DATABASE_URL
const redisUrl = process.env.REDIS_QUEUE_URL
const namespace = process.env.REDIS_NAMESPACE
const configuredTenantId = process.env.AI_TENANT_ID || "educonnect"
if (!databaseUrl) throw new Error("Missing env var: DATABASE_URL")
if (!redisUrl) throw new Error("Missing env var: REDIS_QUEUE_URL")
if (!namespace) throw new Error("Missing env var: REDIS_NAMESPACE")

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
  max: 4,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 30_000,
  query_timeout: 35_000,
  lock_timeout: 5_000,
  idle_in_transaction_session_timeout: 30_000,
  application_name: "educonnect-ai-worker",
})
pool.on("error", (error) => logError("database.pool.error", error))

const workerInstanceId = process.env.HOSTNAME || randomUUID()
const supportedQueues = ["ai.ingest", "ai.embed", "ai.delete", "ai.reconcile"]

function parseJob(job) {
  const data = parseAiQueuePayload(job.queueName, job.data)
  if (data.tenantId !== configuredTenantId) throw new Error("tenant_scope_violation")
  return data
}

async function heartbeat(status = "ready") {
  await pool.query(
    `insert into public.service_heartbeats
       (service_name, instance_id, status, metadata, heartbeat_at)
     values ('ai-worker', $1, $2, $3::jsonb, timezone('utc'::text, now()))
     on conflict (service_name) do update set
       instance_id = excluded.instance_id, status = excluded.status,
       metadata = excluded.metadata, heartbeat_at = excluded.heartbeat_at`,
    [workerInstanceId, status, JSON.stringify({ queues: supportedQueues })]
  )
}

async function idempotent(job, handler) {
  const jobKey = `${job.queueName}:${job.id}`
  const claimed = await pool.query(
    `insert into public.job_executions
       (job_key, queue_name, status, locked_until)
     values ($1, $2, 'processing', timezone('utc'::text, now()) + interval '10 minutes')
     on conflict (job_key) do update set
       status = 'processing', attempts = public.job_executions.attempts + 1,
       locked_until = timezone('utc'::text, now()) + interval '10 minutes',
       updated_at = timezone('utc'::text, now()), last_error = null
     where public.job_executions.status <> 'completed'
       and (public.job_executions.locked_until is null
         or public.job_executions.locked_until < timezone('utc'::text, now()))
     returning job_key`,
    [jobKey, job.queueName]
  )
  if (!claimed.rowCount) {
    const state = await pool.query("select status from public.job_executions where job_key = $1", [jobKey])
    if (state.rows[0]?.status === "completed") return
    throw new Error("ai_job_already_leased")
  }
  try {
    await handler(job)
    await pool.query(
      `update public.job_executions set status = 'completed',
         completed_at = timezone('utc'::text, now()), locked_until = null,
         updated_at = timezone('utc'::text, now()) where job_key = $1`,
      [jobKey]
    )
  } catch (error) {
    await pool.query(
      `update public.job_executions set status = 'failed', locked_until = null,
         last_error = $2, updated_at = timezone('utc'::text, now()) where job_key = $1`,
      [jobKey, error instanceof Error ? error.message.slice(0, 1_000) : "ai_job_failed"]
    ).catch(() => {})
    throw error
  }
}

function sourceLockKey(document) {
  return `${document.teacher_id}:${document.source_type}:${document.source_id}`
}

async function lockSource(client, document) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceLockKey(document)])
}

async function documentForJob(executor, data, forUpdate = false) {
  const result = await executor.query(
    `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
            d.version, d.content_hash, d.status, d.is_current,
            d.embedding_model, d.embedding_dimensions
       from public.ai_documents d
       join public.profiles p on p.id = d.teacher_id
       left join public.classrooms c on c.id = d.classroom_id
      where d.id = $1 and d.teacher_id = $2 and d.version = $3
        and d.embedding_model = $4
        and p.user_type = 'professor' and p.account_status = 'active'
        and p.deleted_at is null
        and (d.classroom_id is null or c.professor_id = d.teacher_id)
      ${forUpdate ? "for update of d" : ""}`,
    [data.documentId, data.teacherId, data.documentVersion, data.embeddingModel]
  )
  if (result.rowCount !== 1) throw new Error("unauthorized_ai_document")
  return result.rows[0]
}

async function currentDocumentUnderLock(client, data, initial) {
  await lockSource(client, initial)
  const document = await documentForJob(client, data, true)
  return documentJobMatchesCurrent(data, document) ? document : null
}

async function loadAuthorizedSource(document, executor = pool) {
  if (document.source_type === "content_item") {
    const result = await executor.query(
      `select ci.title, ci.body_html as body, ci.visibility, ci.updated_at
         from public.content_items ci
        where ci.id = $1 and ci.author_id = $2 and ci.status = 'published'
          and ($3::uuid is null or exists (
            select 1 from public.content_item_classrooms cic
             where cic.content_item_id = ci.id and cic.classroom_id = $3
          ))`,
      [document.source_id, document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  if (document.source_type === "classroom_material") {
    const result = await executor.query(
      `select m.title, m.description as body, 'classrooms'::text as visibility, m.updated_at
         from public.classroom_materials m join public.classrooms c on c.id = m.classroom_id
        where m.id = $1 and c.professor_id = $2 and m.status = 'publicado'
          and m.classroom_id = $3`,
      [document.source_id, document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  if (document.source_type === "classroom_activity") {
    const result = await executor.query(
      `select a.title, a.description as body, 'classrooms'::text as visibility, a.updated_at
         from public.classroom_activities a join public.classrooms c on c.id = a.classroom_id
        where a.id = $1 and c.professor_id = $2 and a.status in ('aberta', 'encerrada')
          and a.classroom_id = $3`,
      [document.source_id, document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  throw new Error("unsupported_ai_source_type")
}

function assertSourcePayload(data, document) {
  if ((data.sourceType && document.source_type !== data.sourceType) ||
      (data.sourceId && document.source_id !== data.sourceId)) {
    throw new Error("source_scope_violation")
  }
}

async function ingest(job) {
  const data = parseJob(job)
  const initial = await documentForJob(pool, data)
  assertSourcePayload(data, initial)
  if (!initial.is_current) return
  const client = await pool.connect()
  try {
    await client.query("begin")
    const document = await currentDocumentUnderLock(client, data, initial)
    if (!document) {
      await client.query("commit")
      return
    }
    assertSourcePayload(data, document)
    const source = await loadAuthorizedSource(document, client)
    const text = normalizeDocumentText(`${source.title}\n${source.body ?? ""}`)
    if (!text) throw new Error("empty_ai_source")
    const chunks = chunkNormalizedDocument(text, { maxChars: 1_500, overlapChars: 200 })
    if (!chunks.length || document.content_hash !== hashContent(text)) {
      throw new Error("source_content_hash_mismatch")
    }
    await client.query(
      `update public.ai_documents set status = 'extracting', indexed_at = null,
         deleted_at = null, error_code = null
       where id = $1 and teacher_id = $2 and is_current`,
      [document.id, document.teacher_id]
    )
    await client.query("delete from public.ai_document_chunks where document_id = $1 and teacher_id = $2", [document.id, document.teacher_id])
    for (const chunk of chunks) {
      await client.query(
        `insert into public.ai_document_chunks
           (document_id, teacher_id, chunk_index, content, content_hash)
         values ($1, $2, $3, $4, $5)`,
        [document.id, document.teacher_id, chunk.index, chunk.content, chunk.contentHash]
      )
    }
    await client.query("update public.ai_documents set status = 'embedding' where id = $1 and teacher_id = $2 and is_current", [document.id, document.teacher_id])
    await client.query(
      `insert into public.outbox_events
         (queue_name, event_type, schema_version, correlation_id, dedup_key,
          aggregate_type, aggregate_id, aggregate_version, payload)
       values ('ai.embed', 'ai.document.chunked', 1, $1, $2, 'ai_document', $3, $4, $5::jsonb)
       on conflict (queue_name, dedup_key) where dedup_key is not null do nothing`,
      [
        data.meta.correlationId,
        `ai-embed:${document.id}:${document.version}:${data.meta.eventId}`,
        document.id,
        document.version,
        JSON.stringify({
          tenantId: configuredTenantId,
          teacherId: document.teacher_id,
          documentId: document.id,
          documentVersion: document.version,
          embeddingModel: document.embedding_model,
        }),
      ]
    )
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function providerClients() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const qdrantUrl = process.env.QDRANT_URL?.trim()
  const qdrantApiKey = process.env.QDRANT_API_KEY?.trim()
  if (!apiKey) throw new Error("missing_openai_api_key")
  if (!qdrantUrl) throw new Error("missing_qdrant_url")
  if (!qdrantApiKey) throw new Error("missing_qdrant_api_key")
  return {
    openai: new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 }),
    qdrant: new QdrantClient({ url: qdrantUrl, apiKey: qdrantApiKey, timeout: 30_000 }),
    collection: process.env.QDRANT_COLLECTION || "educonnect_knowledge",
  }
}

function sourceFilter(document) {
  return { must: [
    { key: "tenant_id", match: { value: configuredTenantId } },
    { key: "teacher_id", match: { value: document.teacher_id } },
    { key: "source_type", match: { value: document.source_type } },
    { key: "source_id", match: { value: document.source_id } },
  ] }
}

async function embed(job) {
  const data = parseJob(job)
  const initial = await documentForJob(pool, data)
  if (!initial.is_current) return
  const source = await loadAuthorizedSource(initial)
  const chunksBefore = await pool.query(
    `select id, chunk_index, content, content_hash from public.ai_document_chunks
      where document_id = $1 and teacher_id = $2 order by chunk_index`,
    [initial.id, initial.teacher_id]
  )
  if (!chunksBefore.rowCount) throw new Error("missing_ai_chunks")
  const { openai, qdrant, collection } = providerClients()
  const response = await openai.embeddings.create({ model: initial.embedding_model, input: chunksBefore.rows.map((row) => row.content) })
  const ordered = [...response.data].sort((left, right) => left.index - right.index)
  const dimensions = ordered[0]?.embedding.length
  if (ordered.length !== chunksBefore.rowCount || !dimensions || ordered.some((item) => item.embedding.length !== dimensions || item.embedding.some((value) => !Number.isFinite(value)))) {
    throw new Error("invalid_embedding_response")
  }

  const client = await pool.connect()
  try {
    await client.query("begin")
    const document = await currentDocumentUnderLock(client, data, initial)
    if (!document) {
      await client.query("commit")
      return
    }
    const currentSource = await loadAuthorizedSource(document, client)
    const chunksNow = await client.query(
      `select id, chunk_index, content, content_hash from public.ai_document_chunks
        where document_id = $1 and teacher_id = $2 order by chunk_index for update`,
      [document.id, document.teacher_id]
    )
    if (JSON.stringify(chunksNow.rows) !== JSON.stringify(chunksBefore.rows)) throw new Error("stale_embedding_input")
    const indexedAt = new Date().toISOString()
    await qdrant.delete(collection, { wait: true, filter: sourceFilter(document) })
    await qdrant.upsert(collection, {
      wait: true,
      points: chunksNow.rows.map((chunk, index) => ({
        id: chunk.id,
        vector: ordered[index].embedding,
        payload: {
          tenant_id: configuredTenantId,
          teacher_id: document.teacher_id,
          classroom_id: document.classroom_id ?? undefined,
          source_type: document.source_type,
          source_id: document.source_id,
          document_id: document.id,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          content_hash: chunk.content_hash,
          visibility: currentSource.visibility,
          language: "pt-BR",
          version: document.version,
          embedding_model: document.embedding_model,
          embedding_dimensions: dimensions,
          indexed_at: indexedAt,
          active: true,
          kind: "internal",
          id: chunk.id,
          title: currentSource.title,
          url: `/ai/sources/${document.id}`,
          retrievedAt: indexedAt,
          excerpt: chunk.content.slice(0, 2_000),
        },
      })),
    })
    await client.query(
      `update public.ai_documents set status = 'indexed', indexed_at = timezone('utc'::text, now()),
         embedding_dimensions = $3, error_code = null
       where id = $1 and teacher_id = $2 and is_current and version = $4 and embedding_model = $5`,
      [document.id, document.teacher_id, dimensions, document.version, document.embedding_model]
    )
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function deleteDocument(job) {
  const data = parseJob(job)
  const initial = await documentForJob(pool, data)
  assertSourcePayload(data, initial)
  if (!initial.is_current) return
  const { qdrant, collection } = providerClients()
  const client = await pool.connect()
  try {
    await client.query("begin")
    const document = await currentDocumentUnderLock(client, data, initial)
    if (!document) {
      await client.query("commit")
      return
    }
    assertSourcePayload(data, document)
    await qdrant.delete(collection, { wait: true, filter: sourceFilter(document) })
    await client.query(
      `update public.ai_documents set status = 'deleted', deleted_at = timezone('utc'::text, now()),
         error_code = null where id = $1 and teacher_id = $2 and is_current
         and version = $3 and embedding_model = $4`,
      [document.id, document.teacher_id, document.version, document.embedding_model]
    )
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function markRevokedDocument(executor, document) {
  await executor.query(
    `update public.ai_documents
        set status = 'deleted', indexed_at = null,
            deleted_at = timezone('utc'::text, now()), error_code = null
      where id = $1 and teacher_id = $2 and is_current and status = 'indexed'`,
    [document.id, document.teacher_id]
  )
}

async function loadCurrentDocuments(teacherId) {
  const documents = []
  let cursor = null
  do {
    const page = await pool.query(
      `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
              d.version, d.content_hash, d.embedding_model, d.embedding_dimensions
         from public.ai_documents d join public.profiles p on p.id = d.teacher_id
        where d.teacher_id = $1 and d.is_current and d.status = 'indexed'
          and p.user_type = 'professor' and p.account_status = 'active' and p.deleted_at is null
          and ($2::uuid is null or d.id > $2)
        order by d.id limit 200`,
      [teacherId, cursor]
    )
    const partition = await partitionAuthorizedDocuments(
      page.rows,
      (document) => loadAuthorizedSource(document)
    )
    for (const document of partition.revoked) await markRevokedDocument(pool, document)
    for (const document of partition.authorized) {
      const chunks = await pool.query(
        `select id, chunk_index, content_hash from public.ai_document_chunks
          where document_id = $1 and teacher_id = $2 order by chunk_index`,
        [document.id, document.teacher_id]
      )
      documents.push({
        id: document.id,
        teacherId: document.teacher_id,
        sourceType: document.source_type,
        sourceId: document.source_id,
        version: document.version,
        embeddingModel: document.embedding_model,
        embeddingDimensions: document.embedding_dimensions,
        chunks: chunks.rows.map((chunk) => ({ id: chunk.id, index: chunk.chunk_index, contentHash: chunk.content_hash })),
      })
    }
    cursor = page.rows.at(-1)?.id ?? null
    if (page.rowCount < 200) break
  } while (cursor)
  return documents
}

async function currentDocumentBySource(client, teacherId, sourceType, sourceId) {
  const result = await client.query(
    `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
            d.version, d.embedding_model, d.embedding_dimensions
       from public.ai_documents d join public.profiles p on p.id = d.teacher_id
      where d.teacher_id = $1 and d.source_type = $2 and d.source_id = $3
        and d.is_current and d.status = 'indexed'
        and p.user_type = 'professor' and p.account_status = 'active'
        and p.deleted_at is null
      for update of d`,
    [teacherId, sourceType, sourceId]
  )
  if (!result.rowCount) return null
  const document = result.rows[0]
  try {
    await loadAuthorizedSource(document, client)
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "unauthorized_ai_source") throw error
    await markRevokedDocument(client, document)
    return null
  }
  const chunks = await client.query(
    `select id, chunk_index, content_hash from public.ai_document_chunks
      where document_id = $1 and teacher_id = $2 order by chunk_index for update`,
    [document.id, document.teacher_id]
  )
  return {
    id: document.id,
    teacherId: document.teacher_id,
    sourceType: document.source_type,
    sourceId: document.source_id,
    version: document.version,
    embeddingModel: document.embedding_model,
    embeddingDimensions: document.embedding_dimensions,
    chunks: chunks.rows.map((chunk) => ({ id: chunk.id, index: chunk.chunk_index, contentHash: chunk.content_hash })),
  }
}

async function deleteExtraPointIfStillExtra(qdrant, collection, point, expectedOwner, scope) {
  const source = expectedOwner
    ? { teacher_id: expectedOwner.teacherId, source_type: expectedOwner.sourceType, source_id: expectedOwner.sourceId }
    : { teacher_id: scope.teacherId, source_type: String(point.payload.source_type), source_id: String(point.payload.source_id) }
  const client = await pool.connect()
  try {
    await client.query("begin")
    await lockSource(client, source)
    const current = await currentDocumentBySource(client, scope.teacherId, source.source_type, source.source_id)
    const fresh = await qdrant.retrieve(collection, { ids: [point.id], with_payload: true, with_vector: false })
    if (fresh.length) {
      const refreshedPlan = planReconciliation(current ? [current] : [], fresh, scope)
      if (refreshedPlan.extraPointIds.some((id) => String(id) === String(point.id))) {
        await qdrant.delete(collection, { wait: true, filter: { must: [
          { key: "tenant_id", match: { value: scope.tenantId } },
          { key: "teacher_id", match: { value: scope.teacherId } },
          { has_id: [point.id] },
        ] } })
      }
    }
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function enqueueMissingDocument(documentId, data) {
  const initial = await documentForJob(pool, {
    ...data,
    documentId,
    documentVersion: data.documents.get(documentId).version,
    embeddingModel: data.documents.get(documentId).embeddingModel,
  })
  const client = await pool.connect()
  try {
    await client.query("begin")
    const document = await currentDocumentUnderLock(client, {
      ...data,
      documentId,
      documentVersion: initial.version,
      embeddingModel: initial.embedding_model,
    }, initial)
    if (document) {
      await client.query(
        `insert into public.outbox_events
           (queue_name, event_type, schema_version, correlation_id, dedup_key,
            aggregate_type, aggregate_id, aggregate_version, payload)
         values ('ai.ingest', 'ai.document.reconcile_requested', 1, $1, $2,
                 'ai_document', $3, $4, $5::jsonb)
         on conflict (queue_name, dedup_key) where dedup_key is not null do nothing`,
        [
          data.meta.correlationId,
          `ai-reconcile:${document.id}:${document.version}:${data.meta.eventId}`,
          document.id,
          document.version,
          JSON.stringify({
            tenantId: configuredTenantId, teacherId: document.teacher_id,
            documentId: document.id, documentVersion: document.version,
            embeddingModel: document.embedding_model,
            sourceType: document.source_type, sourceId: document.source_id,
          }),
        ]
      )
    }
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function reconcile(job) {
  const data = parseJob(job)
  const documents = await loadCurrentDocuments(data.teacherId)
  const { qdrant, collection } = providerClients()
  const scope = { tenantId: configuredTenantId, teacherId: data.teacherId }
  const points = await collectQdrantPages(
    (offset) => qdrant.scroll(collection, {
      filter: { must: [
        { key: "tenant_id", match: { value: configuredTenantId } },
        { key: "teacher_id", match: { value: data.teacherId } },
      ] },
      limit: 100, offset, with_payload: true, with_vector: false,
    }),
    scope
  )
  const plan = planReconciliation(documents, points, scope)
  const documentMap = new Map(documents.map((document) => [document.id, document]))
  const pointOwners = new Map(documents.flatMap((document) => document.chunks.map((chunk) => [chunk.id, document])))
  for (const pointId of plan.extraPointIds) {
    const point = points.find((candidate) => String(candidate.id) === String(pointId))
    if (point) await deleteExtraPointIfStillExtra(qdrant, collection, point, pointOwners.get(String(pointId)), scope)
  }
  const reconcileData = { ...data, documents: documentMap }
  for (const documentId of plan.missingDocumentIds) await enqueueMissingDocument(documentId, reconcileData)
}

const workerOptions = {
  connection: redisConnection(redisUrl),
  prefix: namespace,
  concurrency: Number(process.env.AI_WORKER_CONCURRENCY || "2"),
}
const workers = [
  new Worker("ai.ingest", (job) => idempotent(job, ingest), workerOptions),
  new Worker("ai.embed", (job) => idempotent(job, embed), workerOptions),
  new Worker("ai.delete", (job) => idempotent(job, deleteDocument), workerOptions),
  new Worker("ai.reconcile", (job) => idempotent(job, reconcile), workerOptions),
]

for (const worker of workers) {
  worker.on("ready", () => log("ai-worker.ready", { queue: worker.name }))
  worker.on("completed", (job) => log("ai-job.completed", { queue: worker.name, jobId: job.id }))
  worker.on("failed", (job, error) => {
    logError("ai-job.failed", error, { queue: worker.name, jobId: job?.id })
    if (!job || job.attemptsMade < Number(job.opts.attempts ?? 1)) return
    const jobKey = `${job.queueName}:${job.id}`
    void pool.query(
      `insert into public.job_dead_letters
         (job_key, queue_name, job_name, event_id, attempts, last_error)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (job_key) do update set attempts = excluded.attempts,
         last_error = excluded.last_error, failed_at = timezone('utc'::text, now()), replayed_at = null`,
      [jobKey, job.queueName, job.name, job.data?.meta?.eventId ?? null,
        job.attemptsMade, error.message.slice(0, 1_000)]
    ).catch((dlqError) => logError("ai-job.dlq_write_failed", dlqError, { jobKey }))
  })
  worker.on("error", (error) => logError("ai-worker.error", error, { queue: worker.name }))
}

await heartbeat()
const heartbeatTimer = setInterval(() => void heartbeat().catch((error) => logError("ai-worker.heartbeat.failed", error)), 10_000)
async function shutdown(signal) {
  log("ai-worker.shutdown", { signal })
  clearInterval(heartbeatTimer)
  await heartbeat("stopping").catch(() => {})
  await Promise.all(workers.map((worker) => worker.close()))
  await pool.end()
  process.exit(0)
}
process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))
