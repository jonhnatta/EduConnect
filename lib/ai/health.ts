import type { Env } from "./config.ts"

type Fetcher = typeof fetch

const AI_UNAVAILABLE_MESSAGE = "AI dependencies unavailable"

export function requiredQueueServices(env: Env = process.env): string[] {
  return env.FEATURE_AI_COPILOT?.trim() === "true"
    ? ["dispatcher", "worker", "ai-worker"]
    : ["dispatcher", "worker"]
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

export async function checkAiDependenciesReady(
  env: Env = process.env,
  fetcher: Fetcher = fetch
): Promise<void> {
  if (env.FEATURE_AI_COPILOT?.trim() !== "true") return

  try {
    const qdrantUrl = withoutTrailingSlash(env.QDRANT_URL!.trim())
    const qdrant = await fetcher(`${qdrantUrl}/healthz`, {
      headers: { "api-key": env.QDRANT_API_KEY!.trim() },
      signal: AbortSignal.timeout(3_000),
    })

    if (!qdrant.ok) {
      throw new Error(AI_UNAVAILABLE_MESSAGE)
    }
  } catch {
    throw new Error(AI_UNAVAILABLE_MESSAGE)
  }
}

export type AiObservabilityHealth = {
  langfuse: boolean
  langfuseWorker: boolean
}

export async function checkAiObservabilityHealth(
  env: Env = process.env,
  fetcher: Fetcher = fetch
): Promise<AiObservabilityHealth> {
  const result: AiObservabilityHealth = { langfuse: false, langfuseWorker: false }
  const langfuseUrl = env.LANGFUSE_BASE_URL?.trim()
  const workerUrl = env.LANGFUSE_WORKER_BASE_URL?.trim()
  if (!langfuseUrl || !workerUrl) return result

  const checks = await Promise.allSettled([
    fetcher(`${withoutTrailingSlash(langfuseUrl)}/api/public/health?failIfDatabaseUnavailable=true`, {
      signal: AbortSignal.timeout(3_000),
    }),
    fetcher(`${withoutTrailingSlash(workerUrl)}/api/health`, {
      signal: AbortSignal.timeout(3_000),
    }),
  ])
  return {
    langfuse: checks[0].status === "fulfilled" && checks[0].value.ok,
    langfuseWorker: checks[1].status === "fulfilled" && checks[1].value.ok,
  }
}
