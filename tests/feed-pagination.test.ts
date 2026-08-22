import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  DEFAULT_FEED_PAGE_SIZE,
  MAX_FEED_PAGE_SIZE,
  clampFeedPageSize,
  decodeFeedCursor,
  encodeFeedCursor,
  isStudentFeedCategory,
  nextFeedCursorFromRows,
} from "../lib/content/feed-pagination.ts"
import { mapFeedCardRow } from "../lib/content/feed-card.ts"

test("feed cursor round-trips as an opaque, normalized value", () => {
  const encoded = encodeFeedCursor({
    v: 1,
    scope: "student",
    filter: "provas",
    bucket: "followed",
    sortAt: "2026-07-15T15:30:00.000000Z",
    id: "550e8400-e29b-41d4-a716-446655440000",
  })

  assert.deepEqual(decodeFeedCursor(encoded), {
    v: 1,
    scope: "student",
    filter: "provas",
    bucket: "followed",
    sortAt: "2026-07-15T15:30:00.000000Z",
    id: "550e8400-e29b-41d4-a716-446655440000",
  })
})

test("feed cursor preserves PostgreSQL microseconds", () => {
  const sortAt = "2026-07-15T15:30:00.123456Z"
  const encoded = encodeFeedCursor({
    v: 1,
    scope: "community",
    filter: "all",
    bucket: "other",
    sortAt,
    id: "550e8400-e29b-41d4-a716-446655440000",
  })
  assert.equal(decodeFeedCursor(encoded)?.sortAt, sortAt)
})

test("feed cursor rejects malformed and oversized inputs", () => {
  assert.equal(decodeFeedCursor("not-base64-json"), null)
  assert.equal(decodeFeedCursor("x".repeat(1_025)), null)

  const invalidId = Buffer.from(
    JSON.stringify({
      v: 1,
      scope: "student",
      filter: "todos",
      bucket: "other",
      sortAt: "2026-07-15T15:30:00.000000Z",
      id: "not-a-uuid",
    })
  ).toString("base64url")
  assert.equal(decodeFeedCursor(invalidId), null)

  const invalidTimestamp = Buffer.from(
    JSON.stringify({
      v: 1,
      scope: "student",
      filter: "todos",
      bucket: "other",
      sortAt: "0",
      id: "550e8400-e29b-41d4-a716-446655440000",
    })
  ).toString("base64url")
  assert.equal(decodeFeedCursor(invalidTimestamp), null)

  const yearZero = Buffer.from(
    JSON.stringify({
      v: 1,
      scope: "student",
      filter: "todos",
      bucket: "other",
      sortAt: "0000-01-01T00:00:00.000000Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    })
  ).toString("base64url")
  assert.equal(decodeFeedCursor(yearZero), null)
})

test("feed page size is bounded and categories are allow-listed", () => {
  assert.equal(clampFeedPageSize(undefined), DEFAULT_FEED_PAGE_SIZE)
  assert.equal(clampFeedPageSize(0), 1)
  assert.equal(clampFeedPageSize(10_000), MAX_FEED_PAGE_SIZE)
  assert.equal(clampFeedPageSize(12.9), 12)
  assert.equal(clampFeedPageSize(null), DEFAULT_FEED_PAGE_SIZE)
  assert.equal(clampFeedPageSize({}), DEFAULT_FEED_PAGE_SIZE)
  assert.equal(clampFeedPageSize(Symbol.for("feed")), DEFAULT_FEED_PAGE_SIZE)
  assert.equal(isStudentFeedCategory("dicas"), true)
  assert.equal(isStudentFeedCategory("qualquer-coisa"), false)
})

test("next cursor uses the last visible row and preserves its bucket", () => {
  const rows = [
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      feed_is_following: true,
      feed_cursor_at: "2026-07-15T15:30:00.123457Z",
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440002",
      feed_is_following: false,
      feed_cursor_at: "2026-07-15T15:30:00.123456Z",
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440003",
      feed_is_following: false,
      feed_cursor_at: "2026-07-15T15:30:00.123455Z",
    },
  ]

  const cursor = nextFeedCursorFromRows(rows, 2, "student", "todos")
  assert.deepEqual(decodeFeedCursor(cursor), {
    v: 1,
    scope: "student",
    filter: "todos",
    bucket: "other",
    sortAt: "2026-07-15T15:30:00.123456Z",
    id: "550e8400-e29b-41d4-a716-446655440002",
  })
  assert.equal(nextFeedCursorFromRows(rows.slice(0, 2), 2, "student", "todos"), null)
})

test("feed boundary uses keyset pagination and never selects private settings", () => {
  const source = readFileSync(
    new URL("../app/actions/content-items.ts", import.meta.url),
    "utf8"
  )
  const start = source.indexOf("const STUDENT_FEED_PAGE_SQL")
  const end = source.indexOf("export async function getStudentFeedPage", start)
  assert.ok(start >= 0 && end > start)
  const feedSql = source.slice(start, end)

  assert.equal(/\boffset\b/i.test(feedSql), false)
  assert.equal(/select\s+ci\.\*/i.test(feedSql), false)
  assert.match(feedSql, /coalesce\(ci\.published_at, ci\.created_at\), ci\.id/)
  assert.match(feedSql, /limit greatest\(/)
  assert.match(feedSql, /feed_cursor_at/)
  assert.equal(feedSql.includes("correctIndex"), false)
  assert.equal(/ci\.settings\s+as\s+/i.test(feedSql), false)
})

test("feed card mapper exposes only the public allow-list", () => {
  const item = mapFeedCardRow({
    id: "550e8400-e29b-41d4-a716-446655440000",
    author_id: "550e8400-e29b-41d4-a716-446655440001",
    type: "assessment",
    title: "Avaliacao segura",
    audience: "students",
    published_at: "2026-07-15T15:30:00.000Z",
    like_count: 2,
    share_count: 1,
    comment_count: 3,
    feed_excerpt: "x".repeat(700),
    feed_discipline: " Matematica ",
    feed_question_count: 4,
    feed_due_at: null,
    feed_cover_url: "/cover.png",
    feed_cover_video_url: "/private-answer-video.mp4",
    feed_dica_image_url: null,
    feed_dica_video_url: null,
    feed_author_name: "Professora",
    feed_author_avatar: null,
    // Simula uma linha ampliada por engano: o DTO não pode propagar esses campos.
    settings: { exam: { questions: [{ correctIndex: 2 }] } },
    body_html: "SEGREDO_DO_CORPO_COMPLETO",
  } as Parameters<typeof mapFeedCardRow>[0] & Record<string, unknown>)

  assert.deepEqual(Object.keys(item).sort(), [
    "audience",
    "author",
    "author_id",
    "comment_count",
    "discipline",
    "due_at",
    "excerpt",
    "excerpt_truncated",
    "id",
    "image_url",
    "like_count",
    "published_at",
    "question_count",
    "share_count",
    "title",
    "type",
    "video_url",
  ])
  assert.equal(item.excerpt.length, 600)
  assert.equal(item.excerpt_truncated, true)
  assert.equal(item.video_url, null)
  assert.equal(JSON.stringify(item).includes("correctIndex"), false)
  assert.equal(JSON.stringify(item).includes("SEGREDO_DO_CORPO_COMPLETO"), false)
})
