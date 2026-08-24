export const QUEUE_NAMES = [
  "content.review",
  "content.publish",
  "professor.verify",
  "email.send",
  "notification.fanout",
  "media.scan",
  "blob.delete",
  "account.purge",
  "cache.invalidate",
  "maintenance.cleanup",
  "ai.generate",
  "ai.ingest",
  "ai.embed",
  "ai.web-research",
  "ai.evaluate",
  "ai.delete",
  "ai.reconcile",
] as const

export type QueueName = (typeof QUEUE_NAMES)[number]

export type OutboxEvent = {
  queueName: QueueName
  eventType: string
  schemaVersion?: number
  correlationId?: string
  dedupKey?: string
  aggregateType?: string
  aggregateId?: string
  aggregateVersion?: number
  payload: Record<string, unknown>
  availableAt?: Date
}
