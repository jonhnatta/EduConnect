import { z } from "zod"

export const AI_QUEUE_NAMES = [
  "ai.generate",
  "ai.ingest",
  "ai.embed",
  "ai.web-research",
  "ai.evaluate",
  "ai.delete",
  "ai.reconcile",
] as const

export type AiQueueName = (typeof AI_QUEUE_NAMES)[number]

const common = {
  tenantId: z.string().trim().min(1).max(100),
  teacherId: z.string().uuid(),
}

export const aiQueuePayloadSchemas = {
  "ai.generate": z.object({
    ...common,
    requestId: z.string().uuid(),
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  }).strict(),
  "ai.ingest": z.object({
    ...common,
    documentId: z.string().uuid(),
    sourceType: z.string().trim().min(1).max(100),
    sourceId: z.string().trim().min(1).max(500),
  }).strict(),
  "ai.embed": z.object({
    ...common,
    documentId: z.string().uuid(),
  }).strict(),
  "ai.web-research": z.object({
    ...common,
    requestId: z.string().uuid(),
    query: z.string().trim().min(1).max(2_000),
  }).strict(),
  "ai.evaluate": z.object({
    ...common,
    runId: z.string().uuid(),
  }).strict(),
  "ai.delete": z.object({
    ...common,
    documentId: z.string().uuid(),
    sourceId: z.string().trim().min(1).max(500),
  }).strict(),
  "ai.reconcile": z.object({ ...common }).strict(),
} satisfies Record<AiQueueName, z.ZodTypeAny>

export function parseAiQueuePayload<T extends AiQueueName>(
  queueName: T,
  payload: unknown
): z.infer<(typeof aiQueuePayloadSchemas)[T]> {
  const schema = aiQueuePayloadSchemas[queueName]
  if (!schema) throw new Error("invalid_ai_queue_name")
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new Error("invalid_ai_queue_payload")
  return parsed.data
}
