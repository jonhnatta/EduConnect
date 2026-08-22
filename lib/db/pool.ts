import { Pool } from "pg"

declare global {
  var __dbPool: Pool | undefined
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function resolveSslOption(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.DATABASE_SSL === "false") return false
  if (process.env.DATABASE_SSL_CA) {
    return { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA }
  }
  // Seguro por padrão. Só desabilita validação se explicitamente permitido (self-signed).
  return { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== "true" }
}

export function dbPool(): Pool {
  if (globalThis.__dbPool) return globalThis.__dbPool

  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    // TLS:
    // - DATABASE_SSL=false       → sem TLS (dev local / docker interno)
    // - DATABASE_SSL_CA presente → valida o certificado contra esse CA (seguro)
    // - padrão                   → exige certificado válido (rejectUnauthorized: true)
    // - DATABASE_SSL_INSECURE=true → escape hatch p/ self-signed (NÃO usar em prod)
    ssl: resolveSslOption(),
    max: positiveInt("DATABASE_POOL_MAX", 10),
    connectionTimeoutMillis: positiveInt("DATABASE_CONNECT_TIMEOUT_MS", 5_000),
    idleTimeoutMillis: positiveInt("DATABASE_IDLE_TIMEOUT_MS", 30_000),
    maxLifetimeSeconds: positiveInt("DATABASE_MAX_LIFETIME_SECONDS", 300),
    statement_timeout: positiveInt("DATABASE_STATEMENT_TIMEOUT_MS", 15_000),
    query_timeout: positiveInt("DATABASE_QUERY_TIMEOUT_MS", 20_000),
    lock_timeout: positiveInt("DATABASE_LOCK_TIMEOUT_MS", 5_000),
    idle_in_transaction_session_timeout: positiveInt(
      "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS",
      30_000
    ),
    application_name: process.env.DATABASE_APPLICATION_NAME ?? "educonnect-web",
  })

  pool.on("error", (error) => {
    console.error(JSON.stringify({ event: "database.pool.error", message: error.message }))
  })

  globalThis.__dbPool = pool
  return pool
}
