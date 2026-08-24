import test from "node:test"
import assert from "node:assert/strict"
import { aiConfigErrors, readAiConfig } from "../lib/ai/config.ts"

test("AI provider configuration is optional when the copilot is disabled", () => {
  assert.deepEqual(aiConfigErrors({ FEATURE_AI_COPILOT: "false" }), [])
})

test("AI provider configuration is required in a stable order when the copilot is enabled", () => {
  assert.deepEqual(aiConfigErrors({ FEATURE_AI_COPILOT: "true" }), [
    "OPENAI_API_KEY is required",
    "QDRANT_URL is required",
    "QDRANT_API_KEY is required",
    "LANGFUSE_BASE_URL is required",
    "LANGFUSE_PUBLIC_KEY is required",
    "LANGFUSE_SECRET_KEY is required",
  ])
})

test("AI configuration applies request and token limits by default", () => {
  const config = readAiConfig({ FEATURE_AI_COPILOT: "false" })

  assert.equal(config.dailyRequests, 20)
  assert.equal(config.monthlyTokens, 1_000_000)
})
