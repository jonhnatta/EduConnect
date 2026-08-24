import { createHash } from "node:crypto"
import DOMPurify from "isomorphic-dompurify"
import { z } from "zod"

export const AI_QUEUE_NAMES = [
  "ai.generate", "ai.ingest", "ai.embed", "ai.web-research",
  "ai.evaluate", "ai.delete", "ai.reconcile",
]

const metaSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.number().int().positive(),
  correlationId: z.string().uuid(),
  aggregateType: z.string().trim().min(1).max(100).nullable(),
  aggregateId: z.string().uuid().nullable(),
  aggregateVersion: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).nullable(),
}).strict()
const common = {
  tenantId: z.string().trim().min(1).max(100),
  teacherId: z.string().uuid(),
  meta: metaSchema,
}
const versionedDocument = {
  documentId: z.string().uuid(),
  documentVersion: z.number().int().positive(),
  embeddingModel: z.string().trim().min(1).max(200),
}
export const aiQueuePayloadSchemas = {
  "ai.generate": z.object({ ...common, requestId: z.string().uuid(), conversationId: z.string().uuid(), messageId: z.string().uuid() }).strict(),
  "ai.ingest": z.object({ ...common, ...versionedDocument, sourceType: z.string().trim().min(1).max(100), sourceId: z.string().trim().min(1).max(500) }).strict(),
  "ai.embed": z.object({ ...common, ...versionedDocument }).strict(),
  "ai.web-research": z.object({ ...common, requestId: z.string().uuid(), query: z.string().trim().min(1).max(2_000) }).strict(),
  "ai.evaluate": z.object({ ...common, runId: z.string().uuid() }).strict(),
  "ai.delete": z.object({ ...common, ...versionedDocument, sourceId: z.string().trim().min(1).max(500) }).strict(),
  "ai.reconcile": z.object({ ...common }).strict(),
}

export function parseAiQueuePayload(queueName, payload) {
  const schema = aiQueuePayloadSchemas[queueName]
  if (!schema) throw new Error("invalid_ai_queue_name")
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new Error("invalid_ai_queue_payload")
  return parsed.data
}

export function documentJobMatchesCurrent(data, document) {
  return document?.is_current === true && document.version === data.documentVersion &&
    document.embedding_model === data.embeddingModel
}

const HTML_ENTITIES = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' }
function decodeHtmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    const numeric = code.startsWith("#x")
      ? Number.parseInt(code.slice(2), 16)
      : code.startsWith("#") ? Number.parseInt(code.slice(1), 10) : null
    if (numeric !== null) {
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric) : entity
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? entity
  })
}
export function normalizeDocumentText(input) {
  const safeHtml = DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["figure", "figcaption"],
    ADD_ATTR: ["class", "language"],
  })
  return decodeHtmlEntities(safeHtml
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " "))
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim()
}
function preferredEnd(text, start, hardEnd, overlapChars) {
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
export function chunkDocument(input, options) {
  const { maxChars, overlapChars } = options
  if (typeof input !== "string" || !Number.isInteger(maxChars) || !Number.isInteger(overlapChars) || maxChars <= 0 || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error("invalid_chunk_options")
  }
  const text = normalizeDocumentText(input)
  if (!text) return []
  const chunks = []
  let start = 0
  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + maxChars)
    const end = preferredEnd(text, start, hardEnd, overlapChars)
    const content = text.slice(start, end).trim()
    if (content) chunks.push({ index: chunks.length, content, contentHash: createHash("sha256").update(content).digest("hex") })
    if (end >= text.length) break
    const nextStart = end - overlapChars
    start = nextStart > start ? nextStart : start + 1
  }
  return chunks
}

function requireScopedPoint(point, scope) {
  if (!point || (typeof point.id !== "string" && typeof point.id !== "number")) throw new Error("invalid_reconcile_response")
  const payload = point.payload
  if (!payload || typeof payload !== "object" || payload.tenant_id !== scope.tenantId || payload.teacher_id !== scope.teacherId) {
    throw new Error("reconcile_scope_violation")
  }
  return { ...point, payload }
}
export async function collectQdrantPages(scrollPage, scope) {
  const points = []
  const seenOffsets = new Set()
  let offset
  do {
    const page = await scrollPage(offset)
    if (!page || !Array.isArray(page.points)) throw new Error("invalid_reconcile_response")
    for (const point of page.points) points.push(requireScopedPoint(point, scope))
    const next = page.next_page_offset
    if (next === null || next === undefined) break
    const key = JSON.stringify(next)
    if (seenOffsets.has(key)) throw new Error("invalid_reconcile_pagination")
    seenOffsets.add(key)
    offset = next
  } while (true)
  return points
}
function pointMatchesExpected(point, document, chunk, scope) {
  const payload = point.payload
  return String(point.id) === chunk.id && payload.tenant_id === scope.tenantId &&
    payload.teacher_id === scope.teacherId && payload.document_id === document.id &&
    payload.source_type === document.sourceType && payload.source_id === document.sourceId &&
    payload.version === document.version && payload.embedding_model === document.embeddingModel &&
    payload.embedding_dimensions === document.embeddingDimensions && payload.chunk_index === chunk.index &&
    payload.content_hash === chunk.contentHash && payload.active === true
}
export function planReconciliation(documents, points, scope) {
  const expectedByPoint = new Map()
  for (const document of documents) {
    if (document.teacherId !== scope.teacherId) throw new Error("reconcile_scope_violation")
    for (const chunk of document.chunks) expectedByPoint.set(chunk.id, { document, chunk })
  }
  const matched = new Set()
  const extraPointIds = []
  for (const rawPoint of points) {
    const point = requireScopedPoint(rawPoint, scope)
    const expected = expectedByPoint.get(String(point.id))
    if (!expected || !pointMatchesExpected(point, expected.document, expected.chunk, scope)) extraPointIds.push(point.id)
    else matched.add(String(point.id))
  }
  const missing = new Set()
  for (const [pointId, expected] of expectedByPoint) if (!matched.has(pointId)) missing.add(expected.document.id)
  return { missingDocumentIds: [...missing].sort(), extraPointIds: [...new Set(extraPointIds)] }
}
