import { createHash } from "node:crypto"
import { sanitizeActivityHtml } from "../../sanitize-activity-html.ts"

export type DocumentChunk = {
  index: number
  content: string
  contentHash: string
}

type ChunkOptions = {
  maxChars: number
  overlapChars: number
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    const numeric = code.startsWith("#x")
      ? Number.parseInt(code.slice(2), 16)
      : code.startsWith("#")
        ? Number.parseInt(code.slice(1), 10)
        : null
    if (numeric !== null) {
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? entity
  })
}

function normalizedText(input: string): string {
  const safeHtml = sanitizeActivityHtml(input)
  return decodeHtmlEntities(
    safeHtml
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim()
}

function preferredEnd(text: string, start: number, hardEnd: number, overlapChars: number): number {
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

export function chunkDocument(input: string, options: ChunkOptions): DocumentChunk[] {
  const { maxChars, overlapChars } = options
  if (
    !Number.isInteger(maxChars) ||
    !Number.isInteger(overlapChars) ||
    maxChars <= 0 ||
    overlapChars < 0 ||
    overlapChars >= maxChars
  ) {
    throw new Error("invalid_chunk_options")
  }

  const text = normalizedText(input)
  if (!text) return []

  const chunks: DocumentChunk[] = []
  let start = 0
  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + maxChars)
    const end = preferredEnd(text, start, hardEnd, overlapChars)
    const content = text.slice(start, end).trim()
    if (content) {
      chunks.push({
        index: chunks.length,
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
      })
    }
    if (end >= text.length) break
    const nextStart = end - overlapChars
    start = nextStart > start ? nextStart : start + 1
  }
  return chunks
}
