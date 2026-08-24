import { readAiConfig, type Env } from "./config.ts"

type Fetcher = typeof fetch

const AI_UNAVAILABLE_MESSAGE = "AI dependencies unavailable"

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

export async function checkAiDependenciesReady(
  env: Env = process.env,
  fetcher: Fetcher = fetch
): Promise<void> {
  if (env.FEATURE_AI_COPILOT?.trim() !== "true") return

  try {
    readAiConfig(env)

    const qdrantUrl = withoutTrailingSlash(env.QDRANT_URL!.trim())
    const langfuseUrl = withoutTrailingSlash(env.LANGFUSE_BASE_URL!.trim())
    const [qdrant, langfuse] = await Promise.all([
      fetcher(`${qdrantUrl}/healthz`, {
        headers: { "api-key": env.QDRANT_API_KEY!.trim() },
        signal: AbortSignal.timeout(3_000),
      }),
      fetcher(`${langfuseUrl}/api/public/health`, {
        signal: AbortSignal.timeout(3_000),
      }),
    ])

    if (!qdrant.ok || !langfuse.ok) throw new Error(AI_UNAVAILABLE_MESSAGE)
  } catch {
    throw new Error(AI_UNAVAILABLE_MESSAGE)
  }
}
