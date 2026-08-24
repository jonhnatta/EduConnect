import { aiConfigErrors } from "../ai/config.ts"

const REQUIRED = [
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "EMAIL_PAYLOAD_ENCRYPTION_KEY",
  "ADMIN_TOTP_ENCRYPTION_KEY",
  "ADMIN_SESSION_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
  "REDIS_QUEUE_URL",
  "REDIS_CACHE_URL",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "LEGAL_CONTROLLER_NAME",
  "LEGAL_CONTROLLER_ID",
  "LEGAL_CONTROLLER_ADDRESS",
  "LEGAL_DPO_NAME",
  "LEGAL_PRIVACY_EMAIL",
  "LEGAL_SUPPORT_EMAIL",
  "LEGAL_FORUM",
  "LEGAL_HOSTING_PROVIDER",
] as const

type Environment = Record<string, string | undefined>

function parseOrigin(value: string | undefined, name: string, errors: string[]): URL | null {
  try {
    const url = new URL(value ?? "")
    if (url.pathname !== "/" || url.search || url.hash) errors.push(`${name} must be an origin`)
    return url
  } catch {
    errors.push(`${name} must be a valid URL`)
    return null
  }
}

function validateSecret(env: Environment, name: string, errors: string[]) {
  if ((env[name]?.length ?? 0) < 32) errors.push(`${name} must have at least 32 characters`)
}

function validateAesKey(env: Environment, name: string, errors: string[]) {
  try {
    if (Buffer.from(env[name] ?? "", "base64").length !== 32) {
      errors.push(`${name} must decode to 32 bytes`)
    }
  } catch {
    errors.push(`${name} must be valid base64`)
  }
}

export function productionConfigErrors(env: Environment): string[] {
  const errors: string[] = []
  for (const name of REQUIRED) if (!env[name]?.trim()) errors.push(`${name} is required`)

  const authUrl = parseOrigin(env.AUTH_URL, "AUTH_URL", errors)
  const publicUrl = parseOrigin(env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL", errors)
  if (authUrl && publicUrl && authUrl.origin !== publicUrl.origin) {
    errors.push("AUTH_URL and NEXT_PUBLIC_APP_URL must use the same origin")
  }
  if (authUrl && authUrl.protocol !== "https:") {
    const local = authUrl.hostname === "localhost" || authUrl.hostname === "127.0.0.1"
    if (env.ALLOW_INSECURE_LOCAL_ORIGIN !== "true" || !local) {
      errors.push("AUTH_URL must use HTTPS outside explicit local development")
    }
  }

  validateSecret(env, "AUTH_SECRET", errors)
  validateSecret(env, "ADMIN_SESSION_SECRET", errors)
  validateSecret(env, "CRON_SECRET", errors)
  validateAesKey(env, "EMAIL_PAYLOAD_ENCRYPTION_KEY", errors)
  validateAesKey(env, "ADMIN_TOTP_ENCRYPTION_KEY", errors)

  const email = env.EMAIL_FROM?.replace(/^.*<([^>]+)>$/, "$1")
  if (email && !/^[^\s@<>]+@[^\s@<>]+$/.test(email)) {
    errors.push("EMAIL_FROM must contain a valid address")
  }
  for (const name of ["LEGAL_PRIVACY_EMAIL", "LEGAL_SUPPORT_EMAIL"] as const) {
    if (env[name] && !/^[^\s@<>]+@[^\s@<>]+$/.test(env[name]!)) {
      errors.push(`${name} must be a valid address`)
    }
  }

  errors.push(...aiConfigErrors(env))

  return errors
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const errors = productionConfigErrors(env)
  if (errors.length) throw new Error(`Invalid production configuration: ${errors.join(", ")}`)
}
