import type {
  ContentAudience,
  ContentItemType,
} from "@/lib/content/types"

/** DTO público e enxuto usado pelos cards do feed. */
export type FeedContentItem = {
  id: string
  author_id: string
  type: ContentItemType
  title: string
  excerpt: string
  excerpt_truncated: boolean
  audience: ContentAudience
  published_at: string | null
  discipline: string | null
  question_count: number
  due_at: string | null
  image_url: string | null
  video_url: string | null
  like_count: number
  share_count: number
  comment_count: number
  author: { full_name: string | null; avatar_url: string | null }
}

export type FeedCardProjectionRow = {
  id: string
  author_id: string
  type: ContentItemType
  title: string
  audience: ContentAudience
  published_at: unknown
  like_count: unknown
  share_count: unknown
  comment_count: unknown
  feed_excerpt: unknown
  feed_discipline: unknown
  feed_question_count: unknown
  feed_due_at: unknown
  feed_cover_url: unknown
  feed_cover_video_url: unknown
  feed_dica_image_url: unknown
  feed_dica_video_url: unknown
  feed_author_name: unknown
  feed_author_avatar: unknown
}

export function toFeedIsoString(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value !== "string") return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

export function nullableFeedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function cleanFeedExcerpt(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function mapFeedCardRow(row: FeedCardProjectionRow): FeedContentItem {
  const isExamLike =
    row.type === "exercise" || row.type === "assessment" || row.type === "simulado"
  const dicaVideo = nullableFeedString(row.feed_dica_video_url)
  const imageUrl =
    row.type === "dica"
      ? dicaVideo
        ? null
        : nullableFeedString(row.feed_dica_image_url)
      : nullableFeedString(row.feed_cover_url)
  const videoUrl =
    row.type === "dica"
      ? dicaVideo
      : isExamLike
        ? null
        : nullableFeedString(row.feed_cover_video_url)
  const cleanedExcerpt = cleanFeedExcerpt(row.feed_excerpt)

  return {
    id: row.id,
    author_id: row.author_id,
    type: row.type,
    title: row.title,
    excerpt: cleanedExcerpt.slice(0, 600),
    excerpt_truncated: cleanedExcerpt.length > 600,
    audience: row.audience,
    published_at: toFeedIsoString(row.published_at),
    discipline: nullableFeedString(row.feed_discipline),
    question_count: Math.max(0, Number(row.feed_question_count) || 0),
    due_at: toFeedIsoString(row.feed_due_at),
    image_url: imageUrl,
    video_url: videoUrl,
    like_count: Math.max(0, Number(row.like_count) || 0),
    share_count: Math.max(0, Number(row.share_count) || 0),
    comment_count: Math.max(0, Number(row.comment_count) || 0),
    author: {
      full_name: nullableFeedString(row.feed_author_name),
      avatar_url: nullableFeedString(row.feed_author_avatar),
    },
  }
}
