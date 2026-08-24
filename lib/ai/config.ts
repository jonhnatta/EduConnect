export type Env = Record<string, string | undefined>

const REQUIRED_AI_PROVIDER_VARIABLES = [
  "OPENAI_API_KEY",
  "QDRANT_URL",
  "QDRANT_API_KEY",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
] as const

export function aiConfigErrors(env: Env): string[] {
  if (env.FEATURE_AI_COPILOT !== "true") return []

  return REQUIRED_AI_PROVIDER_VARIABLES
    .filter((name) => !env[name]?.trim())
    .map((name) => `${name} is required`)
}

export function readAiConfig(env: Env = process.env) {
  const errors = aiConfigErrors(env)
  if (errors.length) throw new Error(`Invalid AI configuration: ${errors.join(", ")}`)

  return {
    enabled: env.FEATURE_AI_COPILOT === "true",
    webSearch: env.FEATURE_AI_WEB_SEARCH === "true",
    internalRag: env.FEATURE_AI_INTERNAL_RAG === "true",
    model: env.OPENAI_COPILOT_MODEL || "gpt-5-mini",
    embeddingModel: env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    dailyRequests: Number(env.AI_DAILY_REQUEST_LIMIT || "20"),
    monthlyTokens: Number(env.AI_MONTHLY_TOKEN_LIMIT || "1000000"),
  }
}
