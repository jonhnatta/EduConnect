export type Env = Record<string, string | undefined>

const REQUIRED_AI_PROVIDER_VARIABLES = [
  "OPENAI_API_KEY",
  "QDRANT_URL",
  "QDRANT_API_KEY",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_WORKER_BASE_URL",
] as const

const AI_PROVIDER_URL_VARIABLES = [
  "QDRANT_URL",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_WORKER_BASE_URL",
] as const

const AI_LIMIT_VARIABLES = [
  "AI_DAILY_REQUEST_LIMIT",
  "AI_MONTHLY_TOKEN_LIMIT",
  "AI_EMBEDDING_DIMENSIONS",
] as const

function normalized(env: Env, name: string): string {
  return env[name]?.trim() ?? ""
}

function isEnabled(env: Env): boolean {
  return normalized(env, "FEATURE_AI_COPILOT") === "true"
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname)
  } catch {
    return false
  }
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value)
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
}

function positiveIntegerOrDefault(value: string, defaultValue: number): number {
  return value && isPositiveInteger(value) ? Number(value) : defaultValue
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

export function aiConfigErrors(env: Env): string[] {
  if (!isEnabled(env)) return []

  const errors = REQUIRED_AI_PROVIDER_VARIABLES
    .filter((name) => !normalized(env, name))
    .map((name) => `${name} is required`)

  for (const name of AI_PROVIDER_URL_VARIABLES) {
    const value = normalized(env, name)
    if (value && !isAbsoluteHttpUrl(value)) {
      errors.push(`${name} must be an absolute HTTP or HTTPS URL`)
    }
  }

  for (const name of AI_LIMIT_VARIABLES) {
    const value = normalized(env, name)
    if (value && !isPositiveInteger(value)) {
      errors.push(`${name} must be a positive integer`)
    }
  }

  return errors
}

export function readAiConfig(env: Env = process.env) {
  const errors = aiConfigErrors(env)
  if (errors.length) throw new Error(`Invalid AI configuration: ${errors.join(", ")}`)

  const enabled = isEnabled(env)
  return {
    enabled,
    webSearch: enabled && normalized(env, "FEATURE_AI_WEB_SEARCH") === "true",
    internalRag: enabled && normalized(env, "FEATURE_AI_INTERNAL_RAG") === "true",
    model: normalized(env, "OPENAI_COPILOT_MODEL") || "gpt-5-mini",
    embeddingModel: normalized(env, "OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small",
    embeddingDimensions: positiveIntegerOrDefault(normalized(env, "AI_EMBEDDING_DIMENSIONS"), 1536),
    workerBaseUrl: withoutTrailingSlash(normalized(env, "LANGFUSE_WORKER_BASE_URL")),
    dailyRequests: positiveIntegerOrDefault(normalized(env, "AI_DAILY_REQUEST_LIMIT"), 20),
    monthlyTokens: positiveIntegerOrDefault(normalized(env, "AI_MONTHLY_TOKEN_LIMIT"), 1_000_000),
  }
}
