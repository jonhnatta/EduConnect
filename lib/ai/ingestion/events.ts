export type AiQueueName =
  | "ai.generate"
  | "ai.ingest"
  | "ai.embed"
  | "ai.web-research"
  | "ai.evaluate"
  | "ai.delete"
  | "ai.reconcile"

export {
  AI_QUEUE_NAMES,
  aiQueuePayloadSchemas,
  parseAiQueuePayload,
} from "../../../workers/ai-ingestion-core.mjs"
