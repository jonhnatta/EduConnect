import { createHash, randomUUID } from "node:crypto"
import { Worker } from "bullmq"
import OpenAI from "openai"
import pg from "pg"
import { QdrantClient } from "@qdrant/js-client-rest"
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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const supportedQueues = ["ai.ingest", "ai.embed", "ai.delete", "ai.reconcile"]

function requireString(value, code, maximum = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(code)
  return value.trim()
}

function requireUuid(value, code) {
  const normalized = requireString(value, code, 36)
  if (!uuidPattern.test(normalized)) throw new Error(code)
  return normalized
}

function payloadFor(job, required, optional = []) {
  const data = job.data
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_ai_queue_payload")
  const allowed = new Set(["tenantId", "teacherId", "meta", ...required, ...optional])
  if (Object.keys(data).some((key) => !allowed.has(key))) throw new Error("invalid_ai_queue_payload")
  if (requireString(data.tenantId, "invalid_ai_queue_payload", 100) !== configuredTenantId) {
    throw new Error("tenant_scope_violation")
  }
  requireUuid(data.teacherId, "invalid_ai_queue_payload")
  requireUuid(data.meta?.eventId, "invalid_ai_event_metadata")
  requireUuid(data.meta?.correlationId, "invalid_ai_event_metadata")
  for (const field of required) requireString(data[field], "invalid_ai_queue_payload", 2_000)
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

async function authorizedDocument(documentId, teacherId) {
  const result = await pool.query(
    `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
            d.version, d.content_hash, d.status
       from public.ai_documents d
       join public.profiles p on p.id = d.teacher_id
       left join public.classrooms c on c.id = d.classroom_id
      where d.id = $1 and d.teacher_id = $2
        and p.user_type = 'professor'
        and p.account_status = 'active'
        and p.deleted_at is null
        and (d.classroom_id is null or c.professor_id = d.teacher_id)`,
    [requireUuid(documentId, "invalid_document_id"), requireUuid(teacherId, "invalid_teacher_id")]
  )
  if (result.rowCount !== 1) throw new Error("unauthorized_ai_document")
  return result.rows[0]
}

async function loadAuthorizedSource(document) {
  if (document.source_type === "content_item") {
    const result = await pool.query(
      `select ci.title, ci.body_html as body, ci.visibility, ci.updated_at
         from public.content_items ci
        where ci.id = $1 and ci.author_id = $2 and ci.status = 'published'
          and ($3::uuid is null or exists (
            select 1 from public.content_item_classrooms cic
             where cic.content_item_id = ci.id and cic.classroom_id = $3
          ))`,
      [requireUuid(document.source_id, "invalid_source_id"), document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  if (document.source_type === "classroom_material") {
    const result = await pool.query(
      `select m.title, m.description as body, 'classrooms'::text as visibility, m.updated_at
         from public.classroom_materials m
         join public.classrooms c on c.id = m.classroom_id
        where m.id = $1 and c.professor_id = $2 and m.status = 'publicado'
          and m.classroom_id = $3`,
      [requireUuid(document.source_id, "invalid_source_id"), document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  if (document.source_type === "classroom_activity") {
    const result = await pool.query(
      `select a.title, a.description as body, 'classrooms'::text as visibility, a.updated_at
         from public.classroom_activities a
         join public.classrooms c on c.id = a.classroom_id
        where a.id = $1 and c.professor_id = $2 and a.status in ('aberta', 'encerrada')
          and a.classroom_id = $3`,
      [requireUuid(document.source_id, "invalid_source_id"), document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  throw new Error("unsupported_ai_source_type")
}

function normalizedText(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\s*br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim()
}

function preferredChunkEnd(text, start, hardEnd, overlapChars) {
  if (hardEnd >= text.length) return text.length
  const window = text.slice(start, hardEnd)
  const minimumLength = Math.max(overlapChars + 1, Math.floor(window.length * 0.5))
  let candidate = -1
  const boundaries = /[.!?](?:["')\]]*)?(?=\s|$)/g
  for (const match of window.matchAll(boundaries)) {
    const end = (match.index ?? 0) + match[0].length
    if (end >= minimumLength) candidate = end
  }
  if (candidate > 0) return start + candidate
  const whitespace = window.lastIndexOf(" ")
  return whitespace >= minimumLength ? start + whitespace : hardEnd
}

function chunksFor(text, maxChars = 1_500, overlapChars = 200) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + maxChars)
    const end = preferredChunkEnd(text, start, hardEnd, overlapChars)
    const content = text.slice(start, end).trim()
    if (content) chunks.push({ content, contentHash: createHash("sha256").update(content).digest("hex") })
    if (end >= text.length) break
    start = Math.max(start + 1, end - overlapChars)
  }
  return chunks
}

async function ingest(job) {
  const data = payloadFor(job, ["documentId", "sourceType", "sourceId"])
  const document = await authorizedDocument(data.documentId, data.teacherId)
  if (document.source_type !== data.sourceType || document.source_id !== data.sourceId) {
    throw new Error("source_scope_violation")
  }
  const source = await loadAuthorizedSource(document)
  const text = normalizedText(`${source.title}\n${source.body ?? ""}`)
  if (!text) throw new Error("empty_ai_source")
  const contentHash = createHash("sha256").update(text).digest("hex")
  if (contentHash !== document.content_hash) throw new Error("source_content_hash_mismatch")
  const chunks = chunksFor(text)
  const client = await pool.connect()
  try {
    await client.query("begin")
    await client.query(
      `update public.ai_documents set status = 'extracting', indexed_at = null, deleted_at = null, error_code = null
        where id = $1 and teacher_id = $2`,
      [document.id, document.teacher_id]
    )
    await client.query("delete from public.ai_document_chunks where document_id = $1 and teacher_id = $2", [document.id, document.teacher_id])
    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `insert into public.ai_document_chunks
           (document_id, teacher_id, chunk_index, content, content_hash)
         values ($1, $2, $3, $4, $5)`,
        [document.id, document.teacher_id, index, chunk.content, chunk.contentHash]
      )
    }
    await client.query(
      "update public.ai_documents set status = 'embedding' where id = $1 and teacher_id = $2",
      [document.id, document.teacher_id]
    )
    await client.query(
      `insert into public.outbox_events
         (queue_name, event_type, schema_version, correlation_id, dedup_key,
          aggregate_type, aggregate_id, aggregate_version, payload)
       values ('ai.embed', 'ai.document.chunked', 1, $1, $2, 'ai_document', $3, $4, $5::jsonb)
       on conflict (queue_name, dedup_key) where dedup_key is not null do nothing`,
      [
        job.data.meta.correlationId,
        `ai-embed:${document.id}:${document.version}:${document.content_hash}:${job.data.meta?.eventId}`,
        document.id,
        document.version,
        JSON.stringify({ tenantId: configuredTenantId, teacherId: document.teacher_id, documentId: document.id }),
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
  const apiKey = requireString(process.env.OPENAI_API_KEY, "missing_openai_api_key", 500)
  const qdrantUrl = requireString(process.env.QDRANT_URL, "missing_qdrant_url", 2_000)
  const qdrantApiKey = requireString(process.env.QDRANT_API_KEY, "missing_qdrant_api_key", 500)
  return {
    openai: new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 }),
    qdrant: new QdrantClient({ url: qdrantUrl, apiKey: qdrantApiKey, timeout: 30_000 }),
    collection: process.env.QDRANT_COLLECTION || "educonnect_knowledge",
  }
}

async function embed(job) {
  const data = payloadFor(job, ["documentId"])
  const document = await authorizedDocument(data.documentId, data.teacherId)
  const source = await loadAuthorizedSource(document)
  const result = await pool.query(
    `select id, chunk_index, content, content_hash from public.ai_document_chunks
      where document_id = $1 and teacher_id = $2 order by chunk_index`,
    [document.id, document.teacher_id]
  )
  if (!result.rowCount) throw new Error("missing_ai_chunks")
  const { openai, qdrant, collection } = providerClients()
  const response = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    input: result.rows.map((row) => row.content),
  })
  const ordered = [...response.data].sort((left, right) => left.index - right.index)
  if (ordered.length !== result.rowCount) throw new Error("invalid_embedding_response")
  const dimensions = ordered[0]?.embedding.length
  if (!dimensions || ordered.some((item) => item.embedding.length !== dimensions || item.embedding.some((value) => !Number.isFinite(value)))) {
    throw new Error("invalid_embedding_response")
  }
  const indexedAt = new Date().toISOString()
  await qdrant.delete(collection, {
    wait: true,
    filter: { must: [
      { key: "tenant_id", match: { value: configuredTenantId } },
      { key: "teacher_id", match: { value: document.teacher_id } },
      { key: "source_id", match: { value: document.source_id } },
    ] },
  })
  await qdrant.upsert(collection, {
    wait: true,
    points: result.rows.map((chunk, index) => ({
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
        visibility: source.visibility,
        language: "pt-BR",
        version: document.version,
        indexed_at: indexedAt,
        active: true,
        kind: "internal",
        id: chunk.id,
        title: source.title,
        url: `/ai/sources/${document.id}`,
        retrievedAt: indexedAt,
        excerpt: chunk.content.slice(0, 2_000),
      },
    })),
  })
  await pool.query(
    `update public.ai_documents set status = 'indexed', indexed_at = timezone('utc'::text, now()),
       error_code = null where id = $1 and teacher_id = $2`,
    [document.id, document.teacher_id]
  )
}

async function deleteDocument(job) {
  const data = payloadFor(job, ["documentId", "sourceId"])
  const document = await authorizedDocument(data.documentId, data.teacherId)
  if (document.source_id !== data.sourceId) throw new Error("source_scope_violation")
  const { qdrant, collection } = providerClients()
  await qdrant.delete(collection, {
    wait: true,
    filter: { must: [
      { key: "tenant_id", match: { value: configuredTenantId } },
      { key: "teacher_id", match: { value: document.teacher_id } },
      { key: "source_id", match: { value: document.source_id } },
    ] },
  })
  await pool.query(
    `update public.ai_documents set status = 'deleted', deleted_at = timezone('utc'::text, now()),
       error_code = null where id = $1 and teacher_id = $2`,
    [document.id, document.teacher_id]
  )
}

async function reconcile(job) {
  const data = payloadFor(job, [])
  const profile = await pool.query(
    `select id from public.profiles p where p.id = $1 and p.user_type = 'professor'
      and p.account_status = 'active' and p.deleted_at is null`,
    [data.teacherId]
  )
  if (profile.rowCount !== 1) throw new Error("unauthorized_ai_teacher")
  const documents = await pool.query(
    `select id from public.ai_documents where teacher_id = $1 and status = 'indexed' order by id limit 500`,
    [data.teacherId]
  )
  const { qdrant, collection } = providerClients()
  let offset
  const actual = new Map()
  do {
    const page = await qdrant.scroll(collection, {
      filter: { must: [
        { key: "tenant_id", match: { value: configuredTenantId } },
        { key: "teacher_id", match: { value: data.teacherId } },
        { key: "active", match: { value: true } },
      ] },
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    })
    for (const point of page.points ?? []) {
      const payload = point.payload
      if (
        !payload ||
        payload.tenant_id !== configuredTenantId ||
        payload.teacher_id !== data.teacherId ||
        typeof payload.document_id !== "string"
      ) {
        throw new Error("reconcile_scope_violation")
      }
      if (typeof payload.chunk_index === "number" && typeof payload.content_hash === "string") {
        actual.set(`${payload.document_id}:${payload.chunk_index}`, payload.content_hash)
      }
    }
    offset = page.next_page_offset
  } while (offset !== null && offset !== undefined)

  for (const row of documents.rows) {
    const document = await authorizedDocument(row.id, data.teacherId)
    await loadAuthorizedSource(document)
    const chunks = await pool.query(
      `select chunk_index, content_hash from public.ai_document_chunks
        where document_id = $1 and teacher_id = $2 order by chunk_index`,
      [document.id, document.teacher_id]
    )
    const differs = !chunks.rowCount || chunks.rows.some(
      (chunk) => actual.get(`${document.id}:${chunk.chunk_index}`) !== chunk.content_hash
    )
    if (differs) {
      await pool.query(
        `insert into public.outbox_events
           (queue_name, event_type, schema_version, correlation_id, dedup_key,
            aggregate_type, aggregate_id, aggregate_version, payload)
         values ('ai.ingest', 'ai.document.reconcile_requested', 1, $1, $2,
                 'ai_document', $3, $4, $5::jsonb)
         on conflict (queue_name, dedup_key) where dedup_key is not null do nothing`,
        [
          job.data.meta.correlationId,
          `ai-reconcile:${document.id}:${document.version}:${document.content_hash}:${job.data.meta?.eventId}`,
          document.id,
          document.version,
          JSON.stringify({
            tenantId: configuredTenantId,
            teacherId: document.teacher_id,
            documentId: document.id,
            sourceType: document.source_type,
            sourceId: document.source_id,
          }),
        ]
      )
    }
  }
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
