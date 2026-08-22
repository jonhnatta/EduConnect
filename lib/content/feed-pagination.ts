import type { ContentItemType } from "@/lib/content/types"

export const DEFAULT_FEED_PAGE_SIZE = 12
export const MAX_FEED_PAGE_SIZE = 30

export type FeedScope = "student" | "community"
export type FeedBucket = "followed" | "other"

export type StudentFeedCategory =
  | "todos"
  | "artigos"
  | "exercicios"
  | "provas"
  | "dicas"

export const STUDENT_FEED_CATEGORY_TYPES: Record<
  StudentFeedCategory,
  ContentItemType[]
> = {
  todos: ["article", "exercise", "assessment", "simulado", "dica"],
  artigos: ["article"],
  exercicios: ["exercise"],
  provas: ["assessment", "simulado"],
  dicas: ["dica"],
}

export type FeedCursor = {
  v: 1
  scope: FeedScope
  filter: string
  bucket: FeedBucket
  sortAt: string
  id: string
}

export type FeedCursorRow = {
  id: string
  feed_is_following: boolean
  feed_cursor_at: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CURSOR_TIMESTAMP_RE =
  /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

export function clampFeedPageSize(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") {
    return DEFAULT_FEED_PAGE_SIZE
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_FEED_PAGE_SIZE
  return Math.max(1, Math.min(Math.trunc(parsed), MAX_FEED_PAGE_SIZE))
}

export function isStudentFeedCategory(
  value: unknown
): value is StudentFeedCategory {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(STUDENT_FEED_CATEGORY_TYPES, value)
  )
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function hasCanonicalCursorTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CURSOR_TIMESTAMP_RE.test(value)) return false
  const timestamp = Date.parse(value)
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 19) === value.slice(0, 19)
  )
}

export function decodeFeedCursor(value: unknown): FeedCursor | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) {
    return null
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<FeedCursor>
    if (
      parsed.v !== 1 ||
      (parsed.scope !== "student" && parsed.scope !== "community") ||
      typeof parsed.filter !== "string" ||
      parsed.filter.length === 0 ||
      parsed.filter.length > 32 ||
      (parsed.bucket !== "followed" && parsed.bucket !== "other") ||
      !hasCanonicalCursorTimestamp(parsed.sortAt) ||
      typeof parsed.id !== "string" ||
      !UUID_RE.test(parsed.id)
    ) {
      return null
    }

    return {
      v: 1,
      scope: parsed.scope,
      filter: parsed.filter,
      bucket: parsed.bucket,
      // Mantém microssegundos: Date/ISO do JavaScript reduziria a precisão para ms
      // e poderia pular itens que compartilham o mesmo milissegundo.
      sortAt: parsed.sortAt,
      id: parsed.id.toLowerCase(),
    }
  } catch {
    return null
  }
}

export function nextFeedCursorFromRows(
  rows: FeedCursorRow[],
  pageSize: number,
  scope: FeedScope,
  filter: string
): string | null {
  if (!Number.isInteger(pageSize) || pageSize < 1 || rows.length <= pageSize) {
    return null
  }
  const lastVisible = rows[pageSize - 1]
  if (
    !lastVisible ||
    !UUID_RE.test(lastVisible.id) ||
    !hasCanonicalCursorTimestamp(lastVisible.feed_cursor_at)
  ) {
    return null
  }

  return encodeFeedCursor({
    v: 1,
    scope,
    filter,
    bucket: lastVisible.feed_is_following ? "followed" : "other",
    sortAt: lastVisible.feed_cursor_at,
    id: lastVisible.id.toLowerCase(),
  })
}
