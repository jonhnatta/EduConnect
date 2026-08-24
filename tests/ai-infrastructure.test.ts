import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const expectedServices = [
  "qdrant",
  "langfuse",
  "langfuse-worker",
  "langfuse-postgres",
  "langfuse-clickhouse",
  "langfuse-redis",
  "langfuse-minio",
] as const

const requiredSecrets = [
  "QDRANT_API_KEY",
  "LANGFUSE_NEXTAUTH_SECRET",
  "LANGFUSE_SALT",
  "LANGFUSE_ENCRYPTION_KEY",
  "LANGFUSE_DB_PASSWORD",
  "LANGFUSE_CLICKHOUSE_PASSWORD",
  "LANGFUSE_REDIS_PASSWORD",
  "LANGFUSE_MINIO_ACCESS_KEY",
  "LANGFUSE_MINIO_SECRET_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
] as const

function serviceBlock(compose: string, service: string): string {
  const lines = compose.split("\n")
  const start = lines.findIndex((line) => line === `  ${service}:`)
  assert.notEqual(start, -1, `missing ${service} service`)
  const end = lines.findIndex((line, index) => index > start && /^  [a-zA-Z0-9][\w-]*:$/.test(line))
  return lines.slice(start, end === -1 ? undefined : end).join("\n")
}

test("AI compose keeps every dependency private, persistent and hardened", () => {
  const compose = readFileSync(new URL("../docker-compose.ai.yml", import.meta.url), "utf8")

  assert.doesNotMatch(compose, /^\s+ports:/m)
  assert.doesNotMatch(compose, /(?:^|:)latest(?:@|$)/m)
  for (const port of [6333, 6334, 3000, 3030, 5432, 6379, 8123, 9000, 9001]) {
    assert.doesNotMatch(compose, new RegExp(`["']?${port}:${port}["']?`))
  }

  for (const service of expectedServices) {
    const block = serviceBlock(compose, service)
    assert.match(block, /healthcheck:/, `${service} needs a healthcheck`)
    assert.match(block, /security_opt:\n\s+- no-new-privileges:true/, `${service} needs no-new-privileges`)
    assert.match(block, /networks: \[backend\]/, `${service} must use only backend`)
    assert.match(block, /mem_limit: \$\{[A-Z0-9_]+:-[^}]+\}/, `${service} needs a configurable memory limit`)
    assert.match(block, /cpus: \$\{[A-Z0-9_]+:-[^}]+\}/, `${service} needs a configurable CPU limit`)
    assert.match(block, /pids_limit: \$\{[A-Z0-9_]+:-(?:256|512)\}/, `${service} needs a configurable PID limit`)
  }

  assert.match(compose, /docker\.io\/qdrant\/qdrant:v1\.19\.0@sha256:[a-f0-9]{64}/)
  assert.match(compose, /docker\.io\/langfuse\/langfuse:4@sha256:[a-f0-9]{64}/)
  assert.match(compose, /docker\.io\/langfuse\/langfuse-worker:4@sha256:[a-f0-9]{64}/)
  assert.doesNotMatch(compose, /docker\.io\/langfuse\/langfuse(?:-worker)?:3(?:@|\s|$)/)
  assert.match(compose, /QDRANT__SERVICE__API_KEY: \$\{QDRANT_API_KEY:\?[^}]+\}/)
  assert.match(serviceBlock(compose, "langfuse"), /api\/public\/health\?failIfDatabaseUnavailable=true/)
  assert.match(serviceBlock(compose, "langfuse-worker"), /127\.0\.0\.1:3030\/api\/health/)

  for (const volume of [
    "qdrantdata",
    "langfuse-postgres-data",
    "langfuse-clickhouse-data",
    "langfuse-clickhouse-logs",
    "langfuse-redis-data",
    "langfuse-minio-data",
  ]) {
    assert.match(compose, new RegExp(`^  ${volume}:$`, "m"), `missing named volume ${volume}`)
  }
  assert.doesNotMatch(compose, /(?:^|\s)(?:pgdata|miniodata):/)
})

test("AI compose requires dedicated secrets and wires the app overlay", () => {
  const compose = readFileSync(new URL("../docker-compose.ai.yml", import.meta.url), "utf8")
  for (const secret of requiredSecrets) {
    assert.match(compose, new RegExp(`\\$\\{${secret}:\\?[^}]+\\}`), `${secret} must fail closed`)
  }

  const app = serviceBlock(compose, "app")
  assert.doesNotMatch(app, /depends_on:/)
  assert.match(app, /QDRANT_URL: http:\/\/qdrant:6333/)
  assert.match(app, /QDRANT_API_KEY: \$\{QDRANT_API_KEY:\?[^}]+\}/)
  assert.match(app, /LANGFUSE_BASE_URL: http:\/\/langfuse:3000/)
  assert.match(app, /LANGFUSE_WORKER_BASE_URL: http:\/\/langfuse-worker:3030/)
  assert.match(app, /LANGFUSE_PUBLIC_KEY: \$\{LANGFUSE_PUBLIC_KEY:\?[^}]+\}/)
  assert.match(app, /LANGFUSE_SECRET_KEY: \$\{LANGFUSE_SECRET_KEY:\?[^}]+\}/)
  assert.match(compose, /^# Opt-in:/)
  assert.match(compose, /compose base continua independente da infraestrutura de IA/i)
  assert.match(compose, /falha sem todos os segredos obrigatorios/i)
})

test("disabled AI readiness performs no dependency requests", async () => {
  const { checkAiDependenciesReady } = await import("../lib/ai/health.ts")
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return new Response(null, { status: 200 })
  }

  await checkAiDependenciesReady({ FEATURE_AI_COPILOT: " false " }, fetcher)
  assert.equal(calls, 0)
})

test("enabled AI readiness checks normalized endpoints with isolated credentials", async () => {
  const { checkAiDependenciesReady } = await import("../lib/ai/health.ts")
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(null, { status: 200 })
  }

  await checkAiDependenciesReady({
    FEATURE_AI_COPILOT: " true ",
    OPENAI_API_KEY: "openai-secret",
    QDRANT_URL: "http://qdrant:6333/",
    QDRANT_API_KEY: "qdrant-secret",
    LANGFUSE_BASE_URL: "http://langfuse:3000///",
    LANGFUSE_WORKER_BASE_URL: "http://langfuse-worker:3030////",
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
  }, fetcher)

  assert.equal(calls.length, 3)
  assert.deepEqual(calls.map(({ url }) => url), [
    "http://qdrant:6333/healthz",
    "http://langfuse:3000/api/public/health?failIfDatabaseUnavailable=true",
    "http://langfuse-worker:3030/api/health",
  ])
  assert.equal(new Headers(calls[0].init?.headers).get("api-key"), "qdrant-secret")
  assert.equal(new Headers(calls[1].init?.headers).has("api-key"), false)
  assert.equal(new Headers(calls[2].init?.headers).has("api-key"), false)
  for (const call of calls.slice(1)) {
    const serializedInit = JSON.stringify(call.init)
    for (const secret of ["openai-secret", "qdrant-secret", "pk-test", "sk-test"]) {
      assert.equal(serializedInit.includes(secret), false)
    }
  }
  assert.ok(calls.every(({ init }) => init?.signal instanceof AbortSignal))
})

test("AI readiness sanitizes non-ok dependency responses", async () => {
  const { checkAiDependenciesReady } = await import("../lib/ai/health.ts")
  const env = {
    FEATURE_AI_COPILOT: "true",
    OPENAI_API_KEY: "openai-secret",
    QDRANT_URL: "http://private-qdrant:6333",
    QDRANT_API_KEY: "qdrant-secret",
    LANGFUSE_BASE_URL: "http://private-langfuse:3000",
    LANGFUSE_WORKER_BASE_URL: "http://private-langfuse-worker:3030",
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
  }
  const fetcher = async (input: string | URL | Request) => new Response("sensitive body", {
    status: String(input).includes("worker") ? 503 : 200,
  })

  await assert.rejects(checkAiDependenciesReady(env, fetcher), (error: Error) => {
    assert.equal(error.message, "AI dependencies unavailable")
    assert.equal(error.message.includes("private-qdrant"), false)
    assert.equal(error.message.includes("sensitive"), false)
    return true
  })
})

test("AI readiness sanitizes fetch errors", async () => {
  const { checkAiDependenciesReady } = await import("../lib/ai/health.ts")
  const env = {
    FEATURE_AI_COPILOT: "true",
    OPENAI_API_KEY: "openai-secret",
    QDRANT_URL: "http://qdrant:6333",
    QDRANT_API_KEY: "qdrant-secret",
    LANGFUSE_BASE_URL: "http://langfuse:3000",
    LANGFUSE_WORKER_BASE_URL: "http://langfuse-worker:3030",
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
  }
  const fetcher = async () => {
    throw new Error("secret upstream diagnostics")
  }

  await assert.rejects(checkAiDependenciesReady(env, fetcher), (error: Error) => {
    assert.equal(error.message, "AI dependencies unavailable")
    assert.equal(error.message.includes("diagnostics"), false)
    return true
  })
})
