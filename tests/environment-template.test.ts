import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"

const repositoryRoot = new URL("../", import.meta.url)
const templateUrl = new URL(".env.example", repositoryRoot)

const sectionHeadings = [
  "# 1. Modo de execucao e URLs",
  "# 2. Identidade legal",
  "# 3. PostgreSQL",
  "# 4. Autenticacao",
  "# 5. Redis",
  "# 6. E-mail e tarefas administrativas",
  "# 7. Storage MinIO e S3",
  "# 8. Copilot e OpenAI",
  "# 9. Qdrant",
  "# 10. Langfuse",
  "# 11. Limites de recursos",
  "# 12. Verificacao e seguranca",
  "# 13. Backup",
] as const

const previousTemplateKeys = [
  "ADMIN_SESSION_SECRET",
  "ADMIN_TOTP_ENCRYPTION_KEY",
  "AI_DAILY_REQUEST_LIMIT",
  "AI_EMBEDDING_DIMENSIONS",
  "AI_MONTHLY_TOKEN_LIMIT",
  "AI_VECTOR_SCHEMA_VERSION",
  "ALLOW_INSECURE_LOCAL_ORIGIN",
  "APP_DOMAIN",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "AUTH_TRUST_HOST",
  "AUTH_URL",
  "BACKUP_S3_ACCESS_KEY",
  "BACKUP_S3_REGION",
  "BACKUP_S3_SECRET_KEY",
  "BACKUP_STAGING_DIR",
  "BLOB_READ_WRITE_TOKEN",
  "CACHE_ENABLED",
  "CRON_SECRET",
  "DATABASE_CONNECT_TIMEOUT_MS",
  "DATABASE_IDLE_TIMEOUT_MS",
  "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS",
  "DATABASE_LOCK_TIMEOUT_MS",
  "DATABASE_MAX_LIFETIME_SECONDS",
  "DATABASE_POOL_MAX",
  "DATABASE_QUERY_TIMEOUT_MS",
  "DATABASE_STATEMENT_TIMEOUT_MS",
  "EMAIL_FROM",
  "EMAIL_PAYLOAD_ENCRYPTION_KEY",
  "FEATURE_AI_COPILOT",
  "FEATURE_AI_INTERNAL_RAG",
  "FEATURE_AI_WEB_SEARCH",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_CLICKHOUSE_CPUS",
  "LANGFUSE_CLICKHOUSE_MEM_LIMIT",
  "LANGFUSE_CLICKHOUSE_PASSWORD",
  "LANGFUSE_CLICKHOUSE_PIDS_LIMIT",
  "LANGFUSE_DB_PASSWORD",
  "LANGFUSE_ENCRYPTION_KEY",
  "LANGFUSE_MINIO_ACCESS_KEY",
  "LANGFUSE_MINIO_CPUS",
  "LANGFUSE_MINIO_MEM_LIMIT",
  "LANGFUSE_MINIO_PIDS_LIMIT",
  "LANGFUSE_MINIO_SECRET_KEY",
  "LANGFUSE_NEXTAUTH_SECRET",
  "LANGFUSE_POSTGRES_CPUS",
  "LANGFUSE_POSTGRES_MEM_LIMIT",
  "LANGFUSE_POSTGRES_PIDS_LIMIT",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_REDIS_CPUS",
  "LANGFUSE_REDIS_MEM_LIMIT",
  "LANGFUSE_REDIS_PASSWORD",
  "LANGFUSE_REDIS_PIDS_LIMIT",
  "LANGFUSE_SALT",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_WEB_CPUS",
  "LANGFUSE_WEB_MEM_LIMIT",
  "LANGFUSE_WEB_PIDS_LIMIT",
  "LANGFUSE_WORKER_BASE_URL",
  "LANGFUSE_WORKER_CPUS",
  "LANGFUSE_WORKER_MEM_LIMIT",
  "LANGFUSE_WORKER_PIDS_LIMIT",
  "LEGAL_CONTROLLER_ADDRESS",
  "LEGAL_CONTROLLER_ID",
  "LEGAL_CONTROLLER_NAME",
  "LEGAL_DPO_NAME",
  "LEGAL_FORUM",
  "LEGAL_HOSTING_PROVIDER",
  "LEGAL_PRIVACY_EMAIL",
  "LEGAL_SUPPORT_EMAIL",
  "MALWARE_SCAN_ENABLED",
  "MINIO_ROOT_PASSWORD",
  "MINIO_ROOT_USER",
  "NEXT_PUBLIC_APP_URL",
  "OPENAI_API_KEY",
  "OPENAI_COPILOT_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "POSTGRES_DB",
  "POSTGRES_PASSWORD",
  "POSTGRES_RUNTIME_PASSWORD",
  "POSTGRES_RUNTIME_USER",
  "POSTGRES_USER",
  "PROFESSOR_VERIFICATION_PROVIDER",
  "PURGE_INTERVAL_SECONDS",
  "QDRANT_API_KEY",
  "QDRANT_COLLECTION",
  "QDRANT_CPUS",
  "QDRANT_MEM_LIMIT",
  "QDRANT_PIDS_LIMIT",
  "QDRANT_URL",
  "REDIS_CACHE_PASSWORD",
  "REDIS_NAMESPACE",
  "REDIS_QUEUE_PASSWORD",
  "RESEND_API_KEY",
  "RESTIC_PASSWORD",
  "RESTIC_REPOSITORY",
  "S3_ACCESS_KEY",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_FORCE_PATH_STYLE",
  "S3_REGION",
  "S3_SECRET_KEY",
  "TRUST_PROXY_HEADERS",
  "UPLOAD_SIMULATOR",
] as const

const protectedValues = [
  "POSTGRES_PASSWORD",
  "POSTGRES_RUNTIME_PASSWORD",
  "AUTH_SECRET",
  "AUTH_GOOGLE_SECRET",
  "REDIS_QUEUE_PASSWORD",
  "REDIS_CACHE_PASSWORD",
  "RESEND_API_KEY",
  "EMAIL_PAYLOAD_ENCRYPTION_KEY",
  "ADMIN_TOTP_ENCRYPTION_KEY",
  "ADMIN_SESSION_SECRET",
  "CRON_SECRET",
  "MINIO_ROOT_PASSWORD",
  "S3_SECRET_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "OPENAI_API_KEY",
  "QDRANT_API_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_NEXTAUTH_SECRET",
  "LANGFUSE_SALT",
  "LANGFUSE_DB_PASSWORD",
  "LANGFUSE_CLICKHOUSE_PASSWORD",
  "LANGFUSE_REDIS_PASSWORD",
  "LANGFUSE_MINIO_ACCESS_KEY",
  "LANGFUSE_MINIO_SECRET_KEY",
  "RESTIC_PASSWORD",
  "BACKUP_S3_ACCESS_KEY",
  "BACKUP_S3_SECRET_KEY",
] as const

function parseTemplate(source: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const line of source.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    assert.equal(entries.has(match[1]), false, `duplicate environment key ${match[1]}`)
    entries.set(match[1], match[2])
  }
  return entries
}

test("uses one canonical versioned environment template", () => {
  assert.equal(existsSync(templateUrl), true, ".env.example must exist")
  assert.equal(existsSync(new URL(".env.docker.example", repositoryRoot)), false)
  assert.equal(existsSync(new URL(".env.production.example", repositoryRoot)), false)
})

test("documentation uses only the canonical environment workflow", () => {
  for (const documentationFile of [
    "README.md",
    "docs/RUNBOOK_PRODUCAO_DOCKER.md",
    "docs/SECURITY_AUDIT.md",
  ]) {
    const source = readFileSync(new URL(documentationFile, repositoryRoot), "utf8")
    assert.doesNotMatch(source, /\.env\.(?:docker|production)\.example|\.env\.ai\.local/)
    assert.match(source, /\.env\.example/, `${documentationFile} must point to .env.example`)
  }
})

test("README documents the local Copilot enablement and validation flow", () => {
  const source = readFileSync(new URL("README.md", repositoryRoot), "utf8")

  assert.match(source, /FEATURE_AI_COPILOT=true/)
  assert.match(source, /OPENAI_API_KEY=/)
  assert.match(source, /\.env[\s\S]*ignorado/)
  assert.match(source, /OpenAI[\s\S]*(?:nunca|nao deve)[\s\S]*commit/i)
  assert.match(source, /curl --fail http:\/\/localhost:3000\/api\/health\/live/)
  assert.match(source, /curl --fail http:\/\/localhost:3000\/api\/health\/ready/)
  assert.match(source, /npm test/)
  assert.match(source, /npm run lint/)
  assert.match(source, /npx tsc --noEmit/)
  assert.match(source, /npm run build/)
})

test("keeps the thirteen specified sections complete and ordered", () => {
  const source = readFileSync(templateUrl, "utf8")
  let previousIndex = -1
  for (const heading of sectionHeadings) {
    const index = source.indexOf(heading)
    assert.ok(index > previousIndex, `missing or out-of-order section: ${heading}`)
    previousIndex = index
  }
  assert.equal(source.match(/^# \d+\. /gm)?.length, sectionHeadings.length)

  const values = parseTemplate(source)
  for (const key of previousTemplateKeys) {
    assert.equal(values.has(key), true, `missing key inherited from previous templates: ${key}`)
  }

  for (const composeFile of ["docker-compose.yml", "docker-compose.ai.yml"]) {
    const compose = readFileSync(new URL(composeFile, repositoryRoot), "utf8").replaceAll("$${", "")
    const keys = [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1])
    for (const key of keys) {
      assert.equal(values.has(key), true, `${composeFile} interpolation is undocumented: ${key}`)
    }
  }
})

test("contains local-safe defaults without real credentials", () => {
  const source = readFileSync(templateUrl, "utf8")
  const values = parseTemplate(source)
  for (const key of [
    "AUTH_URL",
    "POSTGRES_PASSWORD",
    "REDIS_QUEUE_PASSWORD",
    "S3_SECRET_KEY",
    "OPENAI_API_KEY",
    "QDRANT_API_KEY",
    "LANGFUSE_SECRET_KEY",
  ]) {
    assert.ok(values.has(key), `missing critical key: ${key}`)
  }

  assert.equal(values.get("AUTH_URL"), "http://localhost:3000")
  assert.equal(values.get("NEXT_PUBLIC_APP_URL"), "http://localhost:3000")
  assert.equal(values.get("APP_DOMAIN"), "localhost")
  assert.equal(values.get("FEATURE_AI_COPILOT"), "false")

  for (const key of protectedValues) {
    const value = values.get(key)
    assert.ok(
      value !== undefined && (value === "" || /^CHANGE_ME_[A-Z0-9_]+$/.test(value)),
      `${key} must be present, empty or use CHANGE_ME_*`,
    )
  }

  for (const key of [
    "POSTGRES_PASSWORD",
    "POSTGRES_RUNTIME_PASSWORD",
    "REDIS_QUEUE_PASSWORD",
    "REDIS_CACHE_PASSWORD",
    "QDRANT_API_KEY",
    "LANGFUSE_DB_PASSWORD",
    "LANGFUSE_REDIS_PASSWORD",
  ]) {
    assert.match(values.get(key) ?? "", /^CHANGE_ME_[A-Z0-9_]+$/, `${key} needs a URL-safe placeholder`)
  }

  assert.match(source, /LANGFUSE_ENCRYPTION_KEY.*(?:64 hexadecimal|64 caracteres hexadecimais)/i)
  assert.match(values.get("LANGFUSE_ENCRYPTION_KEY") ?? "", /^[0-9a-f]{64}$/)
  assert.match(source, /substitua.*openssl rand -hex 32/i)
})
