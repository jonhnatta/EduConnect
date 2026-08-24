import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { AI_QUEUE_NAMES } from "../lib/ai/ingestion/events.ts"
import { chunkDocument } from "../lib/ai/ingestion/chunk.ts"
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

test("AI queue contracts expose exactly the planned queues and reject invalid payloads", async () => {
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

  const { parseAiQueuePayload } = await import("../lib/ai/ingestion/events.ts")
  const common = { tenantId: "educonnect", teacherId }
  const valid = {
    "ai.generate": { ...common, requestId: documentId, conversationId: classroomId, messageId: sourceId },
    "ai.ingest": { ...common, documentId, sourceType: "content_item", sourceId },
    "ai.embed": { ...common, documentId },
    "ai.web-research": { ...common, requestId: documentId, query: "BNCC matemática" },
    "ai.evaluate": { ...common, runId: documentId },
    "ai.delete": { ...common, documentId, sourceId },
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
  assert.match(worker, /insert into public\.job_dead_letters/i)
  assert.match(worker, /p\.user_type = 'professor'/i)
  assert.match(worker, /p\.account_status = 'active'/i)
  assert.match(worker, /d\.teacher_id = \$2/i)
  assert.match(worker, /requireUuid\(data\.meta\?\.eventId, "invalid_ai_event_metadata"\)/)
  assert.match(worker, /requireUuid\(data\.meta\?\.correlationId, "invalid_ai_event_metadata"\)/)
  assert.match(worker, /teacher_id["']?,\s*match:\s*\{\s*value:\s*document\.teacher_id/i)
  assert.match(worker, /source_id["']?,\s*match:\s*\{\s*value:\s*document\.source_id/i)
  assert.match(worker, /content_hash/i)
  assert.match(worker, /throw new Error\("unsupported_ai_source_type"\)/)
  assert.match(worker, /function preferredChunkEnd/)
  assert.match(worker, /\[\.!\?\]/)
  assert.match(worker, /set status = 'extracting', indexed_at = null, deleted_at = null, error_code = null/i)
  assert.match(worker, /id:\s*chunk\.id/)
  assert.match(worker, /`ai-embed:\$\{document\.id\}:\$\{document\.version\}:\$\{document\.content_hash\}:\$\{job\.data\.meta\?\.eventId\}`/)
  assert.match(worker, /`ai-reconcile:\$\{document\.id\}:\$\{document\.version\}:\$\{document\.content_hash\}:\$\{job\.data\.meta\?\.eventId\}`/)

  const embedStart = worker.indexOf("async function embed")
  const deleteStart = worker.indexOf("async function deleteDocument")
  const embedBody = worker.slice(embedStart, deleteStart)
  assert.ok(embedBody.indexOf("qdrant.delete") < embedBody.indexOf("qdrant.upsert"))
  assert.match(embedBody, /tenant_id["']?,\s*match:\s*\{\s*value:\s*configuredTenantId/i)
  assert.match(embedBody, /teacher_id["']?,\s*match:\s*\{\s*value:\s*document\.teacher_id/i)
  assert.match(embedBody, /source_id["']?,\s*match:\s*\{\s*value:\s*document\.source_id/i)

  const reconcileStart = worker.indexOf("async function reconcile")
  const optionsStart = worker.indexOf("const workerOptions", reconcileStart)
  const reconcileBody = worker.slice(reconcileStart, optionsStart)
  assert.match(reconcileBody, /tenant_id["']?,\s*match:\s*\{\s*value:\s*configuredTenantId/i)
  assert.match(reconcileBody, /payload\.tenant_id !== configuredTenantId/)
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
