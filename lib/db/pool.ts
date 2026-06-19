import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
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
    max: Number(process.env.DATABASE_POOL_MAX ?? "10"),
  })

  globalThis.__dbPool = pool
  return pool
}

