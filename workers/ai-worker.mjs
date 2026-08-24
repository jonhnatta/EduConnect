import { randomUUID } from "node:crypto"
import { DelayedError, Worker } from "bullmq"
import OpenAI from "openai"
import pg from "pg"
import { QdrantClient } from "@qdrant/js-client-rest"
import {
  chunkNormalizedDocument,
  collectionCanAdoptMetadata,
  collectQdrantPages,
  compensatePublicationFailure,
  documentJobMatchesCurrent,
  hashContent,
  normalizeDocumentText,
  parseAiQueuePayload,
  partitionAuthorizedDocuments,
  planReconciliation,
  selectPublicationPointIds,
  validateCollectionDimensions,
  validateEmbeddingResponse,
  validateVectorMetadata,
  withTimedBootstrapLock,
} from "./ai-ingestion-core.mjs"
import {
  DENSE_VECTOR_NAME,
  REQUIRED_VECTOR_SCHEMA_VERSION,
  SPARSE_VECTOR_NAME,
  SPARSE_VECTOR_SCHEMA,
  sparseVectorForText,
} from "./ai-vector-core.mjs"
import { log, logError, redisConnection } from "./runtime.mjs"

const databaseUrl = process.env.DATABASE_URL
const redisUrl = process.env.REDIS_QUEUE_URL
const namespace = process.env.REDIS_NAMESPACE
const configuredTenantId = process.env.AI_TENANT_ID || "educonnect"
const configuredEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small"
const configuredEmbeddingDimensions = Number(process.env.AI_EMBEDDING_DIMENSIONS || "1536")
const configuredVectorSchemaVersion = Number(process.env.AI_VECTOR_SCHEMA_VERSION || String(REQUIRED_VECTOR_SCHEMA_VERSION))
const VECTOR_METADATA_POINT_ID = "00000000-0000-4000-8000-000000000001"
if (!databaseUrl) throw new Error("Missing env var: DATABASE_URL")
if (!redisUrl) throw new Error("Missing env var: REDIS_QUEUE_URL")
if (!namespace) throw new Error("Missing env var: REDIS_NAMESPACE")
if (!Number.isInteger(configuredEmbeddingDimensions) || configuredEmbeddingDimensions <= 0) throw new Error("invalid_embedding_dimensions")
if (configuredVectorSchemaVersion !== REQUIRED_VECTOR_SCHEMA_VERSION) throw new Error("invalid_vector_schema_version")

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
  const leaseOwner = randomUUID()
  const claimed = await pool.query(
    `insert into public.job_executions
       (job_key, queue_name, status, locked_until, lease_owner)
     values ($1, $2, 'processing', timezone('utc'::text, now()) + interval '10 minutes', $3)
     on conflict (job_key) do update set
       status = 'processing', attempts = public.job_executions.attempts + 1,
       lease_owner = excluded.lease_owner,
       locked_until = timezone('utc'::text, now()) + interval '10 minutes',
       updated_at = timezone('utc'::text, now()), last_error = null
     where public.job_executions.status <> 'completed'
       and (public.job_executions.locked_until is null
         or public.job_executions.locked_until < timezone('utc'::text, now()))
     returning job_key`,
    [jobKey, job.queueName, leaseOwner]
  )
  if (!claimed.rowCount) {
    const state = await pool.query("select status, locked_until from public.job_executions where job_key = $1", [jobKey])
    if (state.rows[0]?.status === "completed") return
    const resumeAt = Math.max(Date.now() + 1_000, new Date(state.rows[0]?.locked_until ?? Date.now()).getTime() + 100)
    await job.moveToDelayed(resumeAt, job.token)
    throw new DelayedError()
  }
  let leaseLost = false
  const renewLease = async () => {
    const renewed = await pool.query(
      `update public.job_executions
          set locked_until = timezone('utc'::text, now()) + interval '10 minutes', updated_at = timezone('utc'::text, now())
        where job_key = $1 and lease_owner = $2 and status = 'processing'`,
      [jobKey, leaseOwner]
    )
    if (!renewed.rowCount) leaseLost = true
  }
  const leaseTimer = setInterval(() => void renewLease().catch(() => { leaseLost = true }), 60_000)
  try {
    await handler(job)
    if (leaseLost) throw new Error("ai_job_lease_lost")
    const completed = await pool.query(
      `update public.job_executions set status = 'completed',
         completed_at = timezone('utc'::text, now()), locked_until = null, lease_owner = null,
         updated_at = timezone('utc'::text, now()) where job_key = $1 and lease_owner = $2`,
      [jobKey, leaseOwner]
    )
    if (!completed.rowCount) throw new Error("ai_job_lease_lost")
  } catch (error) {
    await pool.query(
      `update public.job_executions set status = 'failed', locked_until = null, lease_owner = null,
         last_error = $3, updated_at = timezone('utc'::text, now())
       where job_key = $1 and lease_owner = $2`,
      [jobKey, leaseOwner, error instanceof Error ? error.message.slice(0, 1_000) : "ai_job_failed"]
    ).catch(() => {})
    throw error
  } finally {
    clearInterval(leaseTimer)
  }
}

function sourceLockKey(document) {
  return `${document.tenant_id}:${document.teacher_id}:${document.source_type}:${document.source_id}`
}

async function lockSource(client, document) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceLockKey(document)])
}

async function lockContentItemAssociation(client, document) {
  if (document.source_type !== "content_item" || !document.classroom_id) return
  const association = await client.query(
    `select content_item_id from public.content_item_classrooms
      where content_item_id = $1 and classroom_id = $2 for update`,
    [document.source_id, document.classroom_id]
  )
  if (association.rowCount !== 1) throw new Error("unauthorized_ai_source")
}

async function lockParentAuthorizers(client, document) {
  const profile = await client.query(
    `select id from public.profiles where id = $1 and user_type = 'professor'
       and account_status = 'active' and deleted_at is null for update`,
    [document.teacher_id]
  )
  if (profile.rowCount !== 1) throw new Error("unauthorized_ai_teacher")
  if (document.classroom_id) {
    const classroom = await client.query(
      `select id from public.classrooms where id = $1 and professor_id = $2 for update`,
      [document.classroom_id, document.teacher_id]
    )
    if (classroom.rowCount !== 1) throw new Error("unauthorized_ai_classroom")
  }
}

async function documentForJob(executor, data, forUpdate = false) {
  const result = await executor.query(
    `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
            d.version, d.content_hash, d.status, d.is_current,
            d.embedding_model, d.embedding_dimensions, d.tenant_id
       from public.ai_documents d
       join public.profiles p on p.id = d.teacher_id
       left join public.classrooms c on c.id = d.classroom_id
      where d.id = $1 and d.teacher_id = $2 and d.version = $3
        and d.embedding_model = $4
        and d.tenant_id = $5
        and p.user_type = 'professor' and p.account_status = 'active'
        and p.deleted_at is null
        and (d.classroom_id is null or c.professor_id = d.teacher_id)
      ${forUpdate ? "for update of d" : ""}`,
    [data.documentId, data.teacherId, data.documentVersion, data.embeddingModel, data.tenantId]
  )
  if (result.rowCount !== 1) throw new Error("unauthorized_ai_document")
  return result.rows[0]
}

async function lockAuthorizedDocument(client, data, initial) {
  await lockParentAuthorizers(client, initial)
  await lockSource(client, initial)
  const source = await loadAuthorizedSource(initial, client, true)
  await lockContentItemAssociation(client, initial)
  const document = await documentForJob(client, data, true)
  if (document.teacher_id !== initial.teacher_id || document.classroom_id !== initial.classroom_id ||
      document.source_type !== initial.source_type || document.source_id !== initial.source_id) {
    throw new Error("stale_ai_document_scope")
  }
  return documentJobMatchesCurrent(data, document) ? { document, source } : { document: null, source: null }
}

async function documentForDeletion(executor, data, forUpdate = false) {
  const result = await executor.query(
    `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
            d.version, d.content_hash, d.status, d.is_current,
            d.embedding_model, d.embedding_dimensions, d.tenant_id
       from public.ai_documents d
      where d.id = $1 and d.teacher_id = $2 and d.version = $3
        and d.embedding_model = $4 and d.tenant_id = $5
      ${forUpdate ? "for update of d" : ""}`,
    [data.documentId, data.teacherId, data.documentVersion, data.embeddingModel, data.tenantId]
  )
  if (result.rowCount !== 1) throw new Error("unauthorized_ai_document")
  const document = result.rows[0]
  assertSourcePayload(data, document)
  return document
}

async function loadAuthorizedSource(document, executor = pool, forUpdate = false) {
  if (document.source_type === "content_item") {
    const associationClause = forUpdate ? "and ($3::uuid is null or $3::uuid is not null)" : `and ($3::uuid is null or exists (
            select 1 from public.content_item_classrooms cic
             where cic.content_item_id = ci.id and cic.classroom_id = $3
          ))`
    const result = await executor.query(
      `select ci.title, ci.body_html as body, ci.visibility, ci.updated_at
         from public.content_items ci
        where ci.id = $1 and ci.author_id = $2 and ci.status = 'published'
          ${associationClause} ${forUpdate ? "for update of ci" : ""}`,
      [document.source_id, document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  if (document.source_type === "classroom_material") {
    const ownerJoin = forUpdate ? "" : "join public.classrooms c on c.id = m.classroom_id"
    const ownerClause = forUpdate ? "and $2::uuid is not null" : "and c.professor_id = $2"
    const result = await executor.query(
      `select m.title, m.description as body, 'classrooms'::text as visibility, m.updated_at
         from public.classroom_materials m ${ownerJoin}
        where m.id = $1 ${ownerClause} and m.status = 'publicado'
          and m.classroom_id = $3 ${forUpdate ? "for update of m" : ""}`,
      [document.source_id, document.teacher_id, document.classroom_id]
    )
    if (result.rowCount !== 1) throw new Error("unauthorized_ai_source")
    return result.rows[0]
  }
  if (document.source_type === "classroom_activity") {
    const ownerJoin = forUpdate ? "" : "join public.classrooms c on c.id = a.classroom_id"
    const ownerClause = forUpdate ? "and $2::uuid is not null" : "and c.professor_id = $2"
    const result = await executor.query(
      `select a.title, a.description as body, 'classrooms'::text as visibility, a.updated_at
         from public.classroom_activities a ${ownerJoin}
        where a.id = $1 ${ownerClause} and a.status in ('aberta', 'encerrada')
          and a.classroom_id = $3 ${forUpdate ? "for update of a" : ""}`,
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
    await client.query("set local idle_in_transaction_session_timeout = '3 minutes'")
    await client.query("set local statement_timeout = '2 minutes'")
    const locked = await lockAuthorizedDocument(client, data, initial)
    const document = locked.document
    if (!document) {
      await client.query("commit")
      return
    }
    assertSourcePayload(data, document)
    const source = locked.source
    const text = normalizeDocumentText(`${source.title}\n${source.body ?? ""}`)
    if (!text) throw new Error("empty_ai_source")
    const chunks = chunkNormalizedDocument(text, { maxChars: 1_500, overlapChars: 200 })
    if (!chunks.length || document.content_hash !== hashContent(text)) {
      throw new Error("source_content_hash_mismatch")
    }
    await client.query(
      `update public.ai_documents set status = 'extracting', indexed_at = null,
       deleted_at = null, error_code = null
       where id = $1 and teacher_id = $2 and tenant_id = $3 and is_current`,
      [document.id, document.teacher_id, configuredTenantId]
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
    await client.query(
      "update public.ai_documents set status = 'embedding' where id = $1 and teacher_id = $2 and tenant_id = $3 and is_current",
      [document.id, document.teacher_id, configuredTenantId]
    )
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

function qdrantProvider() {
  const qdrantUrl = process.env.QDRANT_URL?.trim()
  const qdrantApiKey = process.env.QDRANT_API_KEY?.trim()
  if (!qdrantUrl) throw new Error("missing_qdrant_url")
  if (!qdrantApiKey) throw new Error("missing_qdrant_api_key")
  return {
    qdrant: new QdrantClient({ url: qdrantUrl, apiKey: qdrantApiKey, timeout: 30_000, checkCompatibility: false }),
    collection: process.env.QDRANT_COLLECTION || "educonnect_knowledge_v2",
  }
}

function embeddingProviders() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("missing_openai_api_key")
  return { ...qdrantProvider(), openai: new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 }) }
}

function qdrantConflict(error) {
  return error && typeof error === "object" && (error.status === 409 || /already exists/i.test(String(error.message)))
}

async function bootstrapQdrantUnderLock(qdrant, collection) {
  let details
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await qdrant.getCollections()
      try {
        details = await qdrant.getCollection(collection)
      } catch (error) {
        if (!(error && typeof error === "object" && error.status === 404)) throw error
        try {
          await qdrant.createCollection(collection, {
            vectors: { [DENSE_VECTOR_NAME]: { size: configuredEmbeddingDimensions, distance: "Cosine" } },
            sparse_vectors: { [SPARSE_VECTOR_NAME]: {} },
          })
        } catch (createError) {
          if (!qdrantConflict(createError)) throw createError
        }
        details = await qdrant.getCollection(collection)
      }
      const expectedMetadata = {
        embedding_model: configuredEmbeddingModel,
        schema_version: configuredVectorSchemaVersion,
        dimensions: configuredEmbeddingDimensions,
        distance: "Cosine",
        sparse_schema: SPARSE_VECTOR_SCHEMA,
      }
      let metadataPoints = await qdrant.retrieve(collection, { ids: [VECTOR_METADATA_POINT_ID], with_payload: true, with_vector: false })
      const exactCount = await qdrant.count(collection, { exact: true })
      validateCollectionDimensions(details, configuredEmbeddingDimensions)
      if (!metadataPoints.length) {
        if (!collectionCanAdoptMetadata(metadataPoints, exactCount.count)) throw new Error("qdrant_collection_incompatible")
        const sentinelVector = Array(configuredEmbeddingDimensions).fill(0)
        sentinelVector[0] = 1
        await qdrant.upsert(collection, { wait: true, ordering: "strong", points: [{
          id: VECTOR_METADATA_POINT_ID,
          vector: {
            [DENSE_VECTOR_NAME]: sentinelVector,
            [SPARSE_VECTOR_NAME]: sparseVectorForText("educonnect vector metadata"),
          },
          payload: { tenant_id: "__system__", active: false, kind: "vector_metadata", ...expectedMetadata },
        }] })
        metadataPoints = await qdrant.retrieve(collection, { ids: [VECTOR_METADATA_POINT_ID], with_payload: true, with_vector: false })
        const postAdoptionCount = await qdrant.count(collection, { exact: true })
        if (postAdoptionCount.count !== 1) {
          await qdrant.delete(collection, { wait: true, ordering: "strong", points: [VECTOR_METADATA_POINT_ID] })
          throw new Error("qdrant_collection_incompatible")
        }
      }
      if (!metadataPoints.length) throw new Error("qdrant_collection_incompatible")
      validateVectorMetadata(metadataPoints[0].payload, expectedMetadata)
      const indexes = [
        { field_name: "tenant_id", field_schema: "keyword" },
        { field_name: "teacher_id", field_schema: "keyword" },
        { field_name: "classroom_id", field_schema: "keyword" },
        { field_name: "source_type", field_schema: "keyword" },
        { field_name: "source_id", field_schema: "keyword" },
        { field_name: "publication_attempt_id", field_schema: "keyword" },
        { field_name: "active", field_schema: "bool" },
      ]
      for (const index of indexes) {
        try {
          await qdrant.createPayloadIndex(collection, { wait: true, ...index })
        } catch (error) {
          if (!qdrantConflict(error)) throw error
        }
      }
      return
    } catch (error) {
      if (error instanceof Error && error.message === "qdrant_collection_incompatible") throw error
      if (attempt === 7) throw new Error("qdrant_bootstrap_failed")
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, 250 * (2 ** attempt))))
    }
  }
}

async function bootstrapQdrant() {
  const { qdrant, collection } = qdrantProvider()
  const client = await pool.connect()
  const lockName = `educonnect:qdrant-bootstrap:${collection}`
  let lockAcquired = false
  let lockReleased = false
  try {
    await withTimedBootstrapLock({
      timeoutMs: 30_000,
      retryMs: 250,
      tryAcquire: async () => {
        const result = await client.query(
          "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
          [lockName]
        )
        lockAcquired = result.rows[0]?.acquired === true
        return lockAcquired
      },
      release: async () => {
        const result = await client.query(
          "select pg_advisory_unlock(hashtextextended($1, 0)) as released",
          [lockName]
        )
        lockReleased = result.rows[0]?.released === true
        if (!lockReleased) throw new Error("qdrant_bootstrap_unlock_failed")
      },
    }, () => bootstrapQdrantUnderLock(qdrant, collection))
  } finally {
    client.release(lockAcquired && !lockReleased)
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

async function compensateVectorPublication(qdrant, collection, document, pointIds, publicationAttemptId) {
  if (!pointIds.length) return
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const client = await pool.connect()
    try {
      await client.query("begin")
      await client.query("set local idle_in_transaction_session_timeout = '2 minutes'")
      await lockSource(client, document)
      const candidates = await qdrant.retrieve(collection, { ids: pointIds, with_payload: true, with_vector: false })
      const ownedPointIds = selectPublicationPointIds(candidates, {
        tenantId: configuredTenantId,
        teacherId: document.teacher_id,
        documentId: document.id,
        version: document.version,
        publicationAttemptId,
      })
      if (!ownedPointIds.length) {
        await client.query("commit")
        return
      }
      await qdrant.delete(collection, { wait: true, ordering: "strong", filter: { must: [
        { key: "tenant_id", match: { value: configuredTenantId } },
        { key: "teacher_id", match: { value: document.teacher_id } },
        { key: "document_id", match: { value: document.id } },
        { key: "version", match: { value: document.version } },
        { key: "publication_attempt_id", match: { value: publicationAttemptId } },
        { has_id: ownedPointIds },
      ] } })
      await client.query("commit")
      return
    } catch {
      await client.query("rollback").catch(() => {})
      if (attempt === 2) throw new Error("vector_compensation_failed")
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    } finally {
      client.release()
    }
  }
}

async function embed(job) {
  const data = parseJob(job)
  const initial = await documentForJob(pool, data)
  if (!initial.is_current) return
  await loadAuthorizedSource(initial)
  const chunksBefore = await pool.query(
    `select id, chunk_index, content, content_hash from public.ai_document_chunks
      where document_id = $1 and teacher_id = $2 order by chunk_index`,
    [initial.id, initial.teacher_id]
  )
  if (!chunksBefore.rowCount) throw new Error("missing_ai_chunks")
  if (initial.embedding_model !== configuredEmbeddingModel ||
      initial.embedding_dimensions !== configuredEmbeddingDimensions) {
    throw new Error("embedding_configuration_mismatch")
  }
  const { openai, qdrant, collection } = embeddingProviders()
  const response = await openai.embeddings.create({ model: initial.embedding_model, input: chunksBefore.rows.map((row) => row.content) })
  const ordered = validateEmbeddingResponse(response, chunksBefore.rowCount, configuredEmbeddingDimensions)
  const dimensions = configuredEmbeddingDimensions

  const client = await pool.connect()
  let publication = null
  try {
    await client.query("begin")
    await client.query("set local idle_in_transaction_session_timeout = '3 minutes'")
    await client.query("set local statement_timeout = '2 minutes'")
    const locked = await lockAuthorizedDocument(client, data, initial)
    const document = locked.document
    if (!document) {
      await client.query("commit")
      return
    }
    const currentSource = locked.source
    const currentText = normalizeDocumentText(`${currentSource.title}\n${currentSource.body ?? ""}`)
    if (hashContent(currentText) !== document.content_hash) throw new Error("stale_embedding_source")
    const chunksNow = await client.query(
      `select id, chunk_index, content, content_hash from public.ai_document_chunks
        where document_id = $1 and teacher_id = $2 order by chunk_index for update`,
      [document.id, document.teacher_id]
    )
    if (JSON.stringify(chunksNow.rows) !== JSON.stringify(chunksBefore.rows)) throw new Error("stale_embedding_input")
    const pointIds = chunksNow.rows.map((chunk) => chunk.id)
    const publicationAttemptId = randomUUID()
    publication = { document, pointIds, publicationAttemptId }
    const indexedAt = new Date().toISOString()
    await qdrant.delete(collection, { wait: true, ordering: "strong", filter: sourceFilter(document) })
    await qdrant.upsert(collection, {
      wait: true,
      ordering: "strong",
      points: chunksNow.rows.map((chunk, index) => ({
        id: chunk.id,
        vector: {
          [DENSE_VECTOR_NAME]: ordered[index],
          [SPARSE_VECTOR_NAME]: sparseVectorForText(chunk.content),
        },
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
          vector_schema_version: configuredVectorSchemaVersion,
          sparse_schema: SPARSE_VECTOR_SCHEMA,
          publication_attempt_id: publicationAttemptId,
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
         error_code = null
       where id = $1 and teacher_id = $2 and is_current and version = $3 and embedding_model = $4
         and embedding_dimensions = $5 and tenant_id = $6`,
      [document.id, document.teacher_id, document.version, document.embedding_model, dimensions, configuredTenantId]
    )
    await client.query("commit")
    publication = null
  } catch (error) {
    await client.query("rollback").catch(() => {})
    if (publication) {
      await compensatePublicationFailure(error, () =>
        compensateVectorPublication(
          qdrant, collection, publication.document, publication.pointIds, publication.publicationAttemptId
        )
      )
    }
    throw error
  } finally {
    client.release()
  }
}

async function deleteDocument(job) {
  const data = parseJob(job)
  const initial = await documentForDeletion(pool, data)
  if (!initial.is_current) return
  const { qdrant, collection } = qdrantProvider()
  const client = await pool.connect()
  try {
    await client.query("begin")
    await client.query("set local idle_in_transaction_session_timeout = '3 minutes'")
    await lockSource(client, initial)
    const document = await documentForDeletion(client, data, true)
    if (!documentJobMatchesCurrent(data, document)) {
      await client.query("commit")
      return
    }
    await qdrant.delete(collection, { wait: true, ordering: "strong", filter: sourceFilter(document) })
    await client.query(
      `update public.ai_documents set status = 'deleted', deleted_at = timezone('utc'::text, now()),
         error_code = null where id = $1 and teacher_id = $2 and is_current
         and version = $3 and embedding_model = $4 and tenant_id = $5`,
      [document.id, document.teacher_id, document.version, document.embedding_model, configuredTenantId]
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
      where id = $1 and teacher_id = $2 and tenant_id = $3 and is_current and status = 'indexed'`,
    [document.id, document.teacher_id, configuredTenantId]
  )
}

async function loadCurrentDocuments(teacherId, tenantId) {
  const documents = []
  let cursor = null
  do {
    const page = await pool.query(
      `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
              d.version, d.content_hash, d.embedding_model, d.embedding_dimensions
         from public.ai_documents d join public.profiles p on p.id = d.teacher_id
        where d.teacher_id = $1 and d.tenant_id = $2 and d.is_current and d.status = 'indexed'
          and p.user_type = 'professor' and p.account_status = 'active' and p.deleted_at is null
          and ($3::uuid is null or d.id > $3)
        order by d.id limit 200`,
      [teacherId, tenantId, cursor]
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

async function currentDocumentBySource(client, tenantId, teacherId, sourceType, sourceId) {
  const result = await client.query(
    `select d.id, d.teacher_id, d.classroom_id, d.source_type, d.source_id,
            d.version, d.embedding_model, d.embedding_dimensions, d.tenant_id
       from public.ai_documents d
      where d.tenant_id = $1 and d.teacher_id = $2 and d.source_type = $3 and d.source_id = $4
        and d.is_current and d.status = 'indexed'`,
    [tenantId, teacherId, sourceType, sourceId]
  )
  if (!result.rowCount) return null
  const document = result.rows[0]
  try {
    await lockParentAuthorizers(client, document)
    await lockSource(client, document)
    await loadAuthorizedSource(document, client, true)
    await lockContentItemAssociation(client, document)
  } catch (error) {
    if (!(error instanceof Error) || !["unauthorized_ai_source", "unauthorized_ai_teacher", "unauthorized_ai_classroom"].includes(error.message)) throw error
    await client.query(
      "select id from public.ai_documents where id = $1 and teacher_id = $2 and tenant_id = $3 for update",
      [document.id, document.teacher_id, tenantId]
    )
    await markRevokedDocument(client, document)
    return null
  }
  const locked = await client.query(
    `select id from public.ai_documents where id = $1 and teacher_id = $2 and tenant_id = $3
      and is_current and status = 'indexed' for update`,
    [document.id, document.teacher_id, tenantId]
  )
  if (!locked.rowCount) return null
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
    const current = await currentDocumentBySource(client, scope.tenantId, scope.teacherId, source.source_type, source.source_id)
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
    const locked = await lockAuthorizedDocument(client, {
      ...data,
      documentId,
      documentVersion: initial.version,
      embeddingModel: initial.embedding_model,
    }, initial)
    const document = locked.document
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
  const documents = await loadCurrentDocuments(data.teacherId, data.tenantId)
  const { qdrant, collection } = qdrantProvider()
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
await bootstrapQdrant()
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
