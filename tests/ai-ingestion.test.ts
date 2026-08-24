import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { AI_QUEUE_NAMES, parseAiQueuePayload } from "../lib/ai/ingestion/events.ts"
import { chunkDocument } from "../lib/ai/ingestion/chunk.ts"
import {
  chunkDocument as chunkDocumentCore,
  chunkNormalizedDocument,
  collectQdrantPages,
  compensatePublicationFailure,
  collectionCanAdoptMetadata,
  documentJobMatchesCurrent,
  hashContent,
  normalizeDocumentText,
  parseAiQueuePayload as parseAiQueuePayloadCore,
  partitionAuthorizedDocuments,
  planReconciliation,
  selectPublicationPointIds,
  validateCollectionDimensions,
  validateVectorMetadata,
} from "../workers/ai-ingestion-core.mjs"
import { QUEUE_NAMES } from "../lib/queue/contracts.ts"

const teacherId = "b1f5cfd8-9bba-4ff8-8775-78901d802de8"
const classroomId = "d62c4498-c421-463a-b2bb-3b8802631ac9"
const documentId = "31481143-19e8-4941-96b5-3d0f4b1720fe"
const sourceId = "d4fca119-a7e4-483a-b0c4-91d55bf3ef50"

test("chunker is deterministic, sanitized and bounded", () => {
  const text = `<script>roubar()</script><p>${Array.from(
    { length: 400 },
    (_, index) => `Frase ${index}.`
  ).join(" ")}</p>`
  const first = chunkDocument(text, { maxChars: 500, overlapChars: 80 })
  const second = chunkDocument(text, { maxChars: 500, overlapChars: 80 })

  assert.deepEqual(first, second)
  assert.ok(first.length > 1)
  assert.ok(first.every((chunk) => chunk.content.length > 0 && chunk.content.length <= 500))
  assert.deepEqual(first.map((chunk) => chunk.index), first.map((_, index) => index))
  assert.ok(first.every((chunk) => /^[a-f0-9]{64}$/.test(chunk.contentHash)))
  assert.equal(first.some((chunk) => /<|roubar\(\)/.test(chunk.content)), false)
})

test("chunker progresses for unbroken input and never exceeds overlap bounds", () => {
  const chunks = chunkDocument("a".repeat(1_003), { maxChars: 100, overlapChars: 25 })

  assert.ok(chunks.length > 10)
  assert.ok(chunks.every((chunk) => chunk.content.length <= 100))
  assert.equal(chunks.at(-1)?.content.endsWith("aaa"), true)
  for (let index = 1; index < chunks.length; index += 1) {
    assert.equal(
      chunks[index - 1].content.slice(-25),
      chunks[index].content.slice(0, 25)
    )
  }
})

test("chunker validates options and omits empty chunks", () => {
  assert.deepEqual(chunkDocument(" <p> </p> ", { maxChars: 100, overlapChars: 10 }), [])
  for (const options of [
    { maxChars: 0, overlapChars: 0 },
    { maxChars: 10, overlapChars: -1 },
    { maxChars: 10.5, overlapChars: 1 },
    { maxChars: 10, overlapChars: 10 },
  ]) {
    assert.throws(() => chunkDocument("texto", options), /invalid_chunk_options/)
  }
  assert.doesNotThrow(() => chunkDocument("valor &#999999999; final", { maxChars: 100, overlapChars: 10 }))
})

test("API and worker share one sanitizing chunk implementation", () => {
  assert.equal(chunkDocument, chunkDocumentCore)
  const dangerous = '<svg><g/onload=alert(1)//></svg><p>Seguro</p><script>roubar()</script><img src=x onerror=roubar()>'
  const chunks = chunkDocument(dangerous, { maxChars: 80, overlapChars: 10 })
  assert.ok(chunks.length > 0)
  assert.equal(chunks.some((chunk) => /roubar|onload|onerror|script|svg|img/i.test(chunk.content)), false)
})

test("canonical text is normalized once and hashes the same representation used by chunks", () => {
  const canonical = normalizeDocumentText("<p>&lt;equacao&gt; valor &amp; teste</p>")
  assert.equal(canonical, "<equacao> valor & teste")
  const chunks = chunkNormalizedDocument(canonical, { maxChars: 100, overlapChars: 10 })
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].content, canonical)
  assert.equal(chunks[0].contentHash, hashContent(canonical))
})

test("Qdrant collection bootstrap validates configured vector dimensions", () => {
  assert.doesNotThrow(() => validateCollectionDimensions({ config: { params: { vectors: { size: 1536, distance: "Cosine" } } } }, 1536))
  assert.throws(() => validateCollectionDimensions({ config: { params: { vectors: { size: 3072, distance: "Cosine" } } } }, 1536), /qdrant_collection_incompatible/)
  assert.throws(() => validateCollectionDimensions({ config: { params: { vectors: { size: 1536, distance: "Dot" } } } }, 1536), /qdrant_collection_incompatible/)
})

test("Qdrant metadata sentinel rejects another model or schema at the same dimension", () => {
  const expected = { embedding_model: "text-embedding-3-small", schema_version: 1, dimensions: 1536, distance: "Cosine" }
  assert.doesNotThrow(() => validateVectorMetadata(expected, expected))
  assert.throws(() => validateVectorMetadata({ ...expected, embedding_model: "local-e5" }, expected), /qdrant_collection_incompatible/)
  assert.throws(() => validateVectorMetadata({ ...expected, schema_version: 2 }, expected), /qdrant_collection_incompatible/)
})

test("a collection without metadata can only be adopted while proven empty", () => {
  assert.equal(collectionCanAdoptMetadata([], 0), true)
  assert.equal(collectionCanAdoptMetadata([], 1), false)
  assert.equal(collectionCanAdoptMetadata([{ id: "sentinel" }], 1), false)
})

test("a timed-out or lost transaction compensates the exact attempted point ids", async () => {
  const removed: string[][] = []
  const pointIds = ["point-a", "point-b"]
  await assert.rejects(
    compensatePublicationFailure(new Error("transaction_lost_after_31s"), () => {
      removed.push(pointIds)
      return Promise.resolve()
    }),
    /transaction_lost_after_31s/
  )
  assert.deepEqual(removed, [pointIds])
})

test("publication attempts fence compensation from a newer retry", () => {
  const oldAttempt = "c95c9e8c-1746-4ad6-86ff-45f8b57dfbbc"
  const newAttempt = "29f4b032-8d7b-4c06-90df-e1c023bda6b4"
  const common = {
    tenant_id: "educonnect", teacher_id: teacherId, document_id: documentId, version: 2,
  }
  const points = [
    { id: "overwritten-by-retry", payload: { ...common, publication_attempt_id: newAttempt } },
    { id: "still-owned-by-old-attempt", payload: { ...common, publication_attempt_id: oldAttempt } },
  ]
  assert.deepEqual(selectPublicationPointIds(points, {
    tenantId: "educonnect", teacherId, documentId, version: 2, publicationAttemptId: oldAttempt,
  }), ["still-owned-by-old-attempt"])
})

test("AI queue contracts parse the strict dispatcher envelope", () => {
  const planned = [
    "ai.generate",
    "ai.ingest",
    "ai.embed",
    "ai.web-research",
    "ai.evaluate",
    "ai.delete",
    "ai.reconcile",
  ] as const
  assert.deepEqual(AI_QUEUE_NAMES, planned)
  assert.deepEqual(QUEUE_NAMES.filter((name) => name.startsWith("ai.")), planned)

  assert.equal(parseAiQueuePayload, parseAiQueuePayloadCore)
  const meta = {
    eventId: "95b7e265-a789-4d09-9094-5e74383713c0",
    schemaVersion: 1,
    correlationId: "fd230a9f-f04e-4ceb-acf2-e047407690dd",
    aggregateType: "ai_document",
    aggregateId: documentId,
    aggregateVersion: "2",
  }
  const common = { tenantId: "educonnect", teacherId, meta }
  const valid = {
    "ai.generate": { ...common, requestId: documentId, conversationId: classroomId, messageId: sourceId },
    "ai.ingest": { ...common, documentId, documentVersion: 2, embeddingModel: "text-embedding-3-small", sourceType: "content_item", sourceId },
    "ai.embed": { ...common, documentId, documentVersion: 2, embeddingModel: "text-embedding-3-small" },
    "ai.web-research": { ...common, requestId: documentId, query: "BNCC matemática" },
    "ai.evaluate": { ...common, runId: documentId },
    "ai.delete": { ...common, documentId, documentVersion: 2, embeddingModel: "text-embedding-3-small", sourceId },
    "ai.reconcile": { ...common },
  } as const

  for (const queueName of planned) {
    assert.deepEqual(parseAiQueuePayload(queueName, valid[queueName]), valid[queueName])
    assert.throws(
      () => parseAiQueuePayload(queueName, { ...valid[queueName], teacherId: "from-model" }),
      /invalid_ai_queue_payload/
    )
    assert.throws(
      () => parseAiQueuePayload(queueName, { ...valid[queueName], tenantId: "" }),
      /invalid_ai_queue_payload/
    )
    assert.throws(
      () => parseAiQueuePayload(queueName, { ...valid[queueName], meta: { ...meta, eventId: "bad" } }),
      /invalid_ai_queue_payload/
    )
  }
  assert.throws(
    () => parseAiQueuePayload("ai.unknown" as never, common),
    /invalid_ai_queue_name/
  )
})

test("AI knowledge migration is registered and enforces tenant-owned version integrity", () => {
  const migrationUrl = new URL("../scripts/053_ai_knowledge.sql", import.meta.url)
  assert.ok(existsSync(migrationUrl))
  const sql = readFileSync(migrationUrl, "utf8").replace(/\s+/g, " ").toLowerCase()
  const runner = readFileSync(new URL("../scripts/migrate.mjs", import.meta.url), "utf8")

  assert.match(runner, /\["00570", "ai_knowledge", "scripts\/053_ai_knowledge\.sql"\]/)
  assert.match(sql, /alter table public\.ai_documents[^;]*unique \(id, teacher_id\)/)
  assert.match(sql, /create table if not exists public\.ai_document_chunks \(/)
  assert.match(sql, /ai_document_chunks \([^;]*document_id uuid not null/)
  assert.match(sql, /foreign key \(document_id, teacher_id\) references public\.ai_documents\(id, teacher_id\) on delete cascade/)
  assert.match(sql, /unique \(document_id, chunk_index\)/)
  assert.match(sql, /content_hash text not null check \(content_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  assert.match(sql, /create table if not exists public\.ai_ingestion_jobs \(/)
  assert.match(sql, /ai_ingestion_jobs \([^;]*document_id uuid,[^;]*check \(\(job_type = 'reconcile' and document_id is null\)/)
  assert.match(sql, /job_type text not null check \(job_type in \('ingest', 'embed', 'delete', 'reconcile'\)\)/)
  assert.match(sql, /status text not null[^;]*check \(status in \('pending', 'processing', 'completed', 'failed'\)\)/)
  assert.match(sql, /create trigger handle_ai_document_chunks_updated_at/)
  assert.match(sql, /create trigger handle_ai_ingestion_jobs_updated_at/)
  assert.match(sql, /create unique index if not exists uq_ai_ingestion_jobs_identity[^;]*coalesce\(document_id, '00000000-0000-0000-0000-000000000000'::uuid\)/)
  assert.match(sql, /is_current boolean not null/)
  assert.match(sql, /embedding_model text not null/)
  assert.match(sql, /embedding_dimensions integer/)
  assert.match(sql, /tenant_id text not null default 'educonnect'/)
  assert.match(sql, /create unique index if not exists uq_ai_documents_current_source[^;]*where is_current/)
  assert.match(sql, /create or replace function public\.activate_ai_document_version/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /set is_current = false/)
  assert.match(sql, /add column if not exists lease_owner uuid/)
  assert.doesNotMatch(sql, /create table if not exists public\.ai_documents/)
})

test("dedicated AI worker is tenant-safe and only consumes implemented queues", () => {
  const worker = readFileSync(new URL("../workers/ai-worker.mjs", import.meta.url), "utf8")

  assert.match(worker, /application_name:\s*"educonnect-ai-worker"/)
  for (const queue of ["ai.ingest", "ai.embed", "ai.delete", "ai.reconcile"]) {
    assert.match(worker, new RegExp(`new Worker\\(\\s*["']${queue.replace(".", "\\.")}["']`))
  }
  for (const queue of ["ai.generate", "ai.web-research", "ai.evaluate"]) {
    assert.doesNotMatch(worker, new RegExp(`new Worker\\(\\s*["']${queue.replace(".", "\\.")}["']`))
  }
  assert.match(worker, /insert into public\.job_executions/i)
  assert.match(worker, /lease_owner/i)
  assert.match(worker, /where job_key = \$1 and lease_owner = \$2/i)
  assert.match(worker, /moveToDelayed\(/)
  assert.match(worker, /new DelayedError\(/)
  assert.match(worker, /insert into public\.job_dead_letters/i)
  assert.match(worker, /p\.user_type = 'professor'/i)
  assert.match(worker, /p\.account_status = 'active'/i)
  assert.match(worker, /d\.teacher_id = \$2/i)
  assert.match(worker, /parseAiQueuePayload\(job\.queueName, job\.data\)/)
  assert.match(worker, /teacher_id["']?,\s*match:\s*\{\s*value:\s*document\.teacher_id/i)
  assert.match(worker, /source_id["']?,\s*match:\s*\{\s*value:\s*document\.source_id/i)
  assert.match(worker, /tenant_id["']?,\s*match:\s*\{\s*value:\s*configuredTenantId/i)
  assert.match(worker, /content_hash/i)
  assert.match(worker, /throw new Error\("unsupported_ai_source_type"\)/)
  assert.match(worker, /chunkNormalizedDocument\(text, \{ maxChars: 1_500, overlapChars: 200 \}\)/)
  assert.doesNotMatch(worker, /chunkDocument\(text,/)
  assert.doesNotMatch(worker, /function (?:preferredChunkEnd|chunksFor|normalizedText|payloadFor)/)
  assert.match(worker, /set status = 'extracting', indexed_at = null,\s*deleted_at = null, error_code = null/i)
  assert.match(worker, /id:\s*chunk\.id/)
  assert.match(worker, /embedding_model:\s*document\.embedding_model/)
  assert.match(worker, /embedding_dimensions:\s*dimensions/)
  assert.match(worker, /pg_advisory_xact_lock/)
  assert.match(worker, /for update/i)
  assert.match(worker, /is_current/i)
  assert.doesNotMatch(worker, /limit 500/i)
  assert.match(worker, /`ai-embed:\$\{document\.id\}:\$\{document\.version\}:\$\{data\.meta\.eventId\}`/)
  assert.match(worker, /`ai-reconcile:\$\{document\.id\}:\$\{document\.version\}:\$\{data\.meta\.eventId\}`/)

  const embedStart = worker.indexOf("async function embed")
  const deleteStart = worker.indexOf("async function deleteDocument")
  const embedBody = worker.slice(embedStart, deleteStart)
  assert.ok(embedBody.indexOf("qdrant.delete") < embedBody.indexOf("qdrant.upsert"))
  assert.match(embedBody, /sourceFilter\(document\)/)
  assert.ok(embedBody.indexOf("openai.embeddings.create") < embedBody.indexOf('client.query("begin")'))
  assert.ok(embedBody.indexOf("loadAuthorizedSource(document, client, true)") < embedBody.indexOf("qdrant.delete"))
  assert.ok(embedBody.indexOf("qdrant.upsert") < embedBody.lastIndexOf('client.query("commit")'))
  assert.match(embedBody, /set local idle_in_transaction_session_timeout = '3 minutes'/i)
  assert.match(embedBody, /ordering:\s*"strong"/)
  assert.match(embedBody, /compensateVectorPublication/)

  const reconcileStart = worker.indexOf("async function reconcile")
  const optionsStart = worker.indexOf("const workerOptions", reconcileStart)
  const reconcileBody = worker.slice(reconcileStart, optionsStart)
  assert.match(reconcileBody, /tenant_id["']?,\s*match:\s*\{\s*value:\s*configuredTenantId/i)
  assert.doesNotMatch(reconcileBody, /key:\s*["']active["']/)
  assert.match(worker, /data\.tenantId !== configuredTenantId/)
  assert.match(worker, /has_id:\s*\[point\.id\]/)
  assert.match(worker, /partitionAuthorizedDocuments\(/)
  assert.match(worker, /for \(const document of partition\.revoked\) await markRevokedDocument/)
  assert.match(worker, /set status = 'deleted', indexed_at = null,\s*deleted_at = timezone/)
  assert.match(worker, /createCollection\(/)
  for (const field of ["tenant_id", "teacher_id", "classroom_id", "source_type", "source_id", "active"]) {
    assert.match(worker, new RegExp(`field_name: ["']${field}["']`))
  }
  assert.match(worker, /getCollection\(/)
  assert.match(worker, /VECTOR_METADATA_POINT_ID/)
  assert.match(worker, /schema_version:\s*configuredVectorSchemaVersion/)
  assert.match(worker, /active:\s*false/)
  assert.match(worker, /tenant_id:\s*"__system__"/)
  assert.match(worker, /embedding\.length !== configuredEmbeddingDimensions/)
  assert.match(worker, /loadAuthorizedSource\(document, client, true\)/)
  assert.match(worker, /for update of (?:ci|m|a)/i)
  assert.match(worker, /function qdrantProvider/)
  assert.match(worker, /function embeddingProviders/)
  const deleteBody = worker.slice(worker.indexOf("async function deleteDocument"), worker.indexOf("async function markRevokedDocument"))
  assert.doesNotMatch(deleteBody, /embeddingProviders\(/)
  assert.doesNotMatch(reconcileBody, /embeddingProviders\(/)
  assert.match(worker, /status <> 'completed'[\s\S]*locked_until < timezone/)
  assert.match(worker, /set locked_until =[\s\S]*where job_key = \$1 and lease_owner = \$2 and status = 'processing'/)
  assert.match(worker, /from public\.profiles[\s\S]*for update/i)
  assert.match(worker, /from public\.classrooms[\s\S]*for update/i)
  assert.match(worker, /from public\.content_item_classrooms[\s\S]*for update/i)
  assert.match(worker, /has_id:\s*ownedPointIds/)
  assert.match(worker, /async function documentForDeletion/)
  assert.match(worker, /d\.tenant_id = \$5/i)
  assert.match(deleteBody, /documentForDeletion/)
  assert.doesNotMatch(deleteBody, /lockAuthorizationRows/)
  assert.match(embedBody, /publication_attempt_id:\s*publicationAttemptId/)
  assert.match(worker, /publication_attempt_id["']?,\s*match:/)
  assert.match(worker, /await lockSource\(client, document\)[\s\S]*compensateVectorPublication/)
  assert.match(worker, /qdrant\.count\(collection, \{ exact: true \}\)/)
  assert.match(worker, /collectionCanAdoptMetadata/)

  const authorizationStart = worker.indexOf("async function lockAuthorizedDocument")
  const authorizationEnd = worker.indexOf("async function documentForDeletion", authorizationStart)
  const authorizationBody = worker.slice(authorizationStart, authorizationEnd)
  assert.ok(authorizationBody.indexOf("loadAuthorizedSource") < authorizationBody.indexOf("lockContentItemAssociation"))
  assert.ok(authorizationBody.indexOf("lockContentItemAssociation") < authorizationBody.indexOf("lockRemainingAuthorizers"))
  assert.ok(authorizationBody.indexOf("lockRemainingAuthorizers") < authorizationBody.indexOf("documentForJob"))
})

test("reconciliation paginates and classifies missing, extra and orphan points", async () => {
  const calls: unknown[] = []
  const validPayload = {
    tenant_id: "educonnect",
    teacher_id: teacherId,
    document_id: documentId,
    source_type: "content_item",
    source_id: sourceId,
    version: 2,
    embedding_model: "text-embedding-3-small",
    embedding_dimensions: 2,
    chunk_index: 0,
    content_hash: "a".repeat(64),
    active: true,
  }
  const points = await collectQdrantPages(async (offset: unknown) => {
    calls.push(offset)
    if (offset === undefined) {
      return {
        points: [{ id: "point-valid", payload: validPayload }],
        next_page_offset: "page-2",
      }
    }
    return {
      points: [
        { id: "point-old", payload: { ...validPayload, version: 1 } },
        { id: "point-wrong-source", payload: { ...validPayload, source_id: "wrong" } },
        { id: "point-orphan", payload: { ...validPayload, document_id: classroomId } },
        { id: "point-inactive", payload: { ...validPayload, active: false } },
      ],
      next_page_offset: null,
    }
  }, { tenantId: "educonnect", teacherId })
  assert.deepEqual(calls, [undefined, "page-2"])

  const plan = planReconciliation([{
    id: documentId,
    teacherId,
    sourceType: "content_item",
    sourceId,
    version: 2,
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 2,
    chunks: [
      { id: "point-valid", index: 0, contentHash: "a".repeat(64) },
      { id: "point-missing", index: 1, contentHash: "b".repeat(64) },
    ],
  }], points, { tenantId: "educonnect", teacherId })
  assert.deepEqual(plan.missingDocumentIds, [documentId])
  assert.deepEqual(plan.extraPointIds.sort(), ["point-inactive", "point-old", "point-orphan", "point-wrong-source"])

  await assert.rejects(
    collectQdrantPages(async () => ({
      points: [{ id: "cross-tenant", payload: { ...validPayload, tenant_id: "other" } }],
      next_page_offset: null,
    }), { tenantId: "educonnect", teacherId }),
    /reconcile_scope_violation/
  )
})

test("reconciliation isolates a revoked source and continues with valid documents", async () => {
  const revoked = { id: "revoked", sourceId: "source-revoked" }
  const valid = { id: "valid", sourceId: "source-valid" }
  const visited: string[] = []
  const partition = await partitionAuthorizedDocuments([revoked, valid], async (document: typeof valid) => {
    visited.push(document.id)
    if (document.id === revoked.id) throw new Error("unauthorized_ai_source")
  })
  assert.deepEqual(visited, ["revoked", "valid"])
  assert.deepEqual(partition.authorized, [valid])
  assert.deepEqual(partition.revoked, [revoked])

  const scope = { tenantId: "educonnect", teacherId }
  const validDocument = {
    id: documentId, teacherId, sourceType: "content_item", sourceId,
    version: 2, embeddingModel: "text-embedding-3-small", embeddingDimensions: 2,
    chunks: [{ id: "valid-point", index: 0, contentHash: "a".repeat(64) }],
  }
  const payload = {
    tenant_id: "educonnect", teacher_id: teacherId, source_type: "content_item",
    version: 2, embedding_model: "text-embedding-3-small", embedding_dimensions: 2,
    chunk_index: 0, content_hash: "a".repeat(64), active: true,
  }
  const plan = planReconciliation([validDocument], [
    { id: "revoked-point", payload: { ...payload, document_id: classroomId, source_id: revoked.sourceId } },
    { id: "valid-point", payload: { ...payload, document_id: documentId, source_id: sourceId } },
  ], scope)
  assert.deepEqual(plan.extraPointIds, ["revoked-point"])
  assert.deepEqual(plan.missingDocumentIds, [])
})

test("an older document job becomes a no-op after a newer version is current", () => {
  const current = {
    is_current: true,
    version: 2,
    embedding_model: "text-embedding-3-small",
  }
  assert.equal(documentJobMatchesCurrent({ documentVersion: 1, embeddingModel: "text-embedding-3-small" }, current), false)
  assert.equal(documentJobMatchesCurrent({ documentVersion: 2, embeddingModel: "text-embedding-3-small" }, current), true)
  assert.equal(documentJobMatchesCurrent({ documentVersion: 2, embeddingModel: "other-model" }, current), false)
  assert.equal(documentJobMatchesCurrent({ documentVersion: 2, embeddingModel: "text-embedding-3-small" }, { ...current, is_current: false }), false)
})

test("AI worker remains opt-in and private in Compose", () => {
  const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8")
  const start = compose.indexOf("  ai-worker:")
  assert.notEqual(start, -1)
  const nextService = compose.indexOf("\n  dispatcher:", start)
  const service = compose.slice(start, nextService)

  assert.match(service, /profiles:\s*\[ai\]/)
  assert.match(service, /command:\s*\["node", "workers\/ai-worker\.mjs"\]/)
  assert.match(service, /DATABASE_URL:/)
  assert.match(service, /REDIS_QUEUE_URL:/)
  assert.match(service, /OPENAI_API_KEY:/)
  assert.match(service, /QDRANT_URL:/)
  assert.match(service, /networks:\s*\[backend\]/)
  assert.match(service, /mem_limit:/)
  assert.match(service, /cpus:/)
  assert.match(service, /pids_limit:/)
  assert.doesNotMatch(service, /ports:/)
  const appStart = compose.indexOf("  app:")
  const appEnd = compose.indexOf("\n  worker:", appStart)
  assert.doesNotMatch(compose.slice(appStart, appEnd), /ai-worker/)
})
