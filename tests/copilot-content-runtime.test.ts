import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { performanceSummaryFromRow } from "../lib/ai/copilot/performance-summary.ts"

test("maps pre-aggregated performance for two members and two activities without multiplying submissions", () => {
  const summary = performanceSummaryFromRow({
    member_count: 2,
    activity_count: 2,
    submission_count: 3,
    average_score: 70,
    distinct_submitter_count: 2,
  })

  assert.deepEqual(summary, {
    activityCount: 2,
    submissionCount: 3,
    averageScore: 70,
    deliveryRate: 1,
  })
})

test("queries members, activities, and submissions in independent aggregates", () => {
  const source = readFileSync("lib/ai/copilot/runtime.ts", "utf8")
  assert.match(source, /with\s+member_counts\s+as/i)
  assert.match(source, /activity_stats\s+as/i)
  assert.match(source, /submission_stats\s+as/i)
  assert.match(source, /avg\(submission\.score_total\)/i)
})
