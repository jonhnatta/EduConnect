export type DocumentChunk = {
  index: number
  content: string
  contentHash: string
}

export type ChunkOptions = {
  maxChars: number
  overlapChars: number
}

export { chunkDocument } from "../../../workers/ai-ingestion-core.mjs"
