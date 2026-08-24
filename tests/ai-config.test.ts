import test from "node:test"
import assert from "node:assert/strict"
import { aiConfigErrors, readAiConfig } from "../lib/ai/config.ts"

const enabledAiEnv = (overrides: Record<string, string | undefined> = {}) => ({
  FEATURE_AI_COPILOT: "true",
  OPENAI_API_KEY: "openai-test-key",
  QDRANT_URL: "http://qdrant:6333",
  QDRANT_API_KEY: "qdrant-test-key",
  LANGFUSE_BASE_URL: "http://langfuse:3000",
  LANGFUSE_WORKER_BASE_URL: "http://langfuse-worker:3030",
  LANGFUSE_PUBLIC_KEY: "langfuse-public-test-key",
  LANGFUSE_SECRET_KEY: "langfuse-secret-test-key",
  ...overrides,
})

test("AI provider configuration is optional when the copilot is disabled", () => {
  assert.deepEqual(aiConfigErrors({ FEATURE_AI_COPILOT: "false" }), [])
})

test("AI provider configuration is required in a stable order when the copilot is enabled", () => {
  assert.deepEqual(aiConfigErrors({ FEATURE_AI_COPILOT: " true " }), [
    "OPENAI_API_KEY is required",
    "QDRANT_URL is required",
    "QDRANT_API_KEY is required",
    "LANGFUSE_BASE_URL is required",
    "LANGFUSE_PUBLIC_KEY is required",
    "LANGFUSE_SECRET_KEY is required",
    "LANGFUSE_WORKER_BASE_URL is required",
  ])
})

test("AI configuration applies request and token limits by default", () => {
  const config = readAiConfig({ FEATURE_AI_COPILOT: "false" })

  assert.equal(config.dailyRequests, 20)
  assert.equal(config.monthlyTokens, 1_000_000)
})

test("AI limits must be positive finite integers when the copilot is enabled", () => {
  for (const value of ["NaN", "Infinity", "0", "-1", "1.5"]) {
    assert.deepEqual(aiConfigErrors(enabledAiEnv({ AI_DAILY_REQUEST_LIMIT: value })), [
      "AI_DAILY_REQUEST_LIMIT must be a positive integer",
    ])
    assert.deepEqual(aiConfigErrors(enabledAiEnv({ AI_MONTHLY_TOKEN_LIMIT: value })), [
      "AI_MONTHLY_TOKEN_LIMIT must be a positive integer",
    ])
  }
})

test("disabled AI replaces invalid optional limits with safe defaults", () => {
  for (const value of ["NaN", "Infinity", "0", "-1", "1.5"]) {
    const config = readAiConfig({
      FEATURE_AI_COPILOT: "false",
      AI_DAILY_REQUEST_LIMIT: value,
      AI_MONTHLY_TOKEN_LIMIT: value,
    })

    assert.equal(config.dailyRequests, 20)
    assert.equal(config.monthlyTokens, 1_000_000)
  }
})

test("disabled AI keeps dependent feature flags off", () => {
  const config = readAiConfig({
    FEATURE_AI_COPILOT: " false ",
    FEATURE_AI_WEB_SEARCH: "true",
    FEATURE_AI_INTERNAL_RAG: "true",
  })

  assert.equal(config.enabled, false)
  assert.equal(config.webSearch, false)
  assert.equal(config.internalRag, false)
})

test("AI provider URLs must be absolute HTTP or HTTPS URLs", () => {
  assert.deepEqual(aiConfigErrors(enabledAiEnv({ QDRANT_URL: "not a url" })), [
    "QDRANT_URL must be an absolute HTTP or HTTPS URL",
  ])
  assert.deepEqual(aiConfigErrors(enabledAiEnv({ LANGFUSE_BASE_URL: "ftp://host" })), [
    "LANGFUSE_BASE_URL must be an absolute HTTP or HTTPS URL",
  ])
  assert.deepEqual(aiConfigErrors(enabledAiEnv({ LANGFUSE_WORKER_BASE_URL: "/worker" })), [
    "LANGFUSE_WORKER_BASE_URL must be an absolute HTTP or HTTPS URL",
  ])
})

test("AI configuration normalizes the Langfuse worker base URL", () => {
  const config = readAiConfig(enabledAiEnv({
    LANGFUSE_WORKER_BASE_URL: "  http://langfuse-worker:3030///  ",
  }))

  assert.equal(config.workerBaseUrl, "http://langfuse-worker:3030")
})

test("AI models are trimmed and blank values use safe defaults", () => {
  const config = readAiConfig(enabledAiEnv({
    FEATURE_AI_COPILOT: " true ",
    FEATURE_AI_WEB_SEARCH: " true ",
    FEATURE_AI_INTERNAL_RAG: " true ",
    OPENAI_COPILOT_MODEL: "  gpt-5-mini-custom  ",
    OPENAI_EMBEDDING_MODEL: "   ",
  }))

  assert.equal(config.enabled, true)
  assert.equal(config.webSearch, true)
  assert.equal(config.internalRag, true)
  assert.equal(config.model, "gpt-5-mini-custom")
  assert.equal(config.embeddingModel, "text-embedding-3-small")
})
