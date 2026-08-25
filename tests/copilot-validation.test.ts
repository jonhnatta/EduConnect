import assert from "node:assert/strict"
import test from "node:test"
import {
  conversationCreateSchema,
  copilotMessageInputSchema,
  feedbackSchema,
} from "../lib/ai/copilot/validation.ts"

test("accepts Copilot messages with content from 1 to 8,000 characters", () => {
  assert.equal(copilotMessageInputSchema.safeParse({ content: "a" }).success, true)
  assert.equal(
    copilotMessageInputSchema.safeParse({ content: "a".repeat(8_000) }).success,
    true
  )
})

test("rejects empty, whitespace-only, and oversized Copilot messages", () => {
  for (const content of ["", "   ", "a".repeat(8_001)]) {
    assert.equal(
      copilotMessageInputSchema.safeParse({ content }).success,
      false,
      `expected content of length ${content.length} to be rejected`
    )
  }
})

test("accepts an omitted title or a trimmed title up to 160 characters", () => {
  assert.deepEqual(conversationCreateSchema.parse({}), {})
  assert.deepEqual(
    conversationCreateSchema.parse({ title: "  Planejamento de aula  " }),
    { title: "Planejamento de aula" }
  )
  assert.equal(
    conversationCreateSchema.safeParse({ title: "a".repeat(160) }).success,
    true
  )
})

test("rejects empty, whitespace-only, and oversized titles", () => {
  for (const title of ["", "   ", "a".repeat(161)]) {
    assert.equal(
      conversationCreateSchema.safeParse({ title }).success,
      false,
      `expected title of length ${title.length} to be rejected`
    )
  }
})

test("accepts only positive or negative feedback ratings", () => {
  for (const rating of ["positive", "negative"] as const) {
    assert.equal(feedbackSchema.safeParse({ rating }).success, true)
  }
  for (const rating of ["neutral", "up", "", 1, null]) {
    assert.equal(
      feedbackSchema.safeParse({ rating }).success,
      false,
      `expected rating ${String(rating)} to be rejected`
    )
  }
})

test("accepts optional feedback comments up to 1,000 characters", () => {
  assert.equal(feedbackSchema.safeParse({ rating: "positive" }).success, true)
  assert.deepEqual(
    feedbackSchema.parse({ rating: "negative", comment: "  Muito útil  " }),
    { rating: "negative", comment: "Muito útil" }
  )
  assert.equal(
    feedbackSchema.safeParse({ rating: "positive", comment: "a".repeat(1_000) })
      .success,
    true
  )
  assert.equal(
    feedbackSchema.safeParse({ rating: "positive", comment: "a".repeat(1_001) })
      .success,
    false
  )
})
