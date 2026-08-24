import type { PoolClient, QueryResultRow } from "pg"
import { readAiConfig } from "./config.ts"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AiAccessState = {
  approved: boolean
  betaEnabled: boolean
  featureEnabled: boolean
  requests: number
  requestLimit: number
  tokens: number
  tokenLimit: number
}

export type AiAccessDenialCode =
  | "invalid_access_state"
  | "professor_not_approved"
  | "beta_disabled"
  | "feature_disabled"
  | "daily_quota_exceeded"
  | "monthly_quota_exceeded"

export type AiAccessDecision =
  | { ok: true }
  | { ok: false; code: AiAccessDenialCode }

export type AiUsageReservation =
  | { ok: true }
  | {
      ok: false
      code:
        | "feature_disabled"
        | "professor_not_approved"
        | "account_inactive"
        | "beta_disabled"
        | "daily_quota_exceeded"
        | "monthly_quota_exceeded"
    }

type TeacherProfileRow = QueryResultRow & {
  user_type: string | null
  professor_verification_status: string | null
  account_status: string
  deleted_at: Date | string | null
}

type BetaAccessRow = QueryResultRow & {
  enabled: boolean
  daily_request_limit: number | null
  monthly_token_limit: string | number | null
}

type MonthlyUsageRow = QueryResultRow & {
  used_tokens: string | number
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function decideAiAccess(state: AiAccessState): AiAccessDecision {
  const validState =
    typeof state.approved === "boolean" &&
    typeof state.betaEnabled === "boolean" &&
    typeof state.featureEnabled === "boolean" &&
    isNonNegativeInteger(state.requests) &&
    isPositiveInteger(state.requestLimit) &&
    isNonNegativeInteger(state.tokens) &&
    isPositiveInteger(state.tokenLimit)

  if (!validState) return { ok: false, code: "invalid_access_state" }
  if (!state.approved) return { ok: false, code: "professor_not_approved" }
  if (!state.betaEnabled) return { ok: false, code: "beta_disabled" }
  if (!state.featureEnabled) return { ok: false, code: "feature_disabled" }
  if (state.requests >= state.requestLimit) {
    return { ok: false, code: "daily_quota_exceeded" }
  }
  if (state.tokens >= state.tokenLimit) {
    return { ok: false, code: "monthly_quota_exceeded" }
  }
  return { ok: true }
}

function positiveDailyLimit(value: number | null, fallback: number): number {
  return typeof value === "number" && isPositiveInteger(value) ? value : fallback
}

function positiveMonthlyLimit(
  value: string | number | null,
  fallback: number
): bigint {
  try {
    const parsed = value === null ? BigInt(fallback) : BigInt(value)
    return parsed > BigInt(0) ? parsed : BigInt(fallback)
  } catch {
    return BigInt(fallback)
  }
}

function nonNegativeUsage(value: string | number): bigint {
  const parsed = BigInt(value)
  if (parsed < BigInt(0)) throw new Error("Invalid negative AI usage returned by database")
  return parsed
}

/**
 * Atomically reserves one request and its estimated tokens.
 *
 * This function owns BEGIN, COMMIT and ROLLBACK. It must receive a dedicated
 * PoolClient that is not already inside a transaction.
 */
export async function reserveAiUsage(
  client: PoolClient,
  teacherId: string,
  estimatedTokens: number
): Promise<AiUsageReservation> {
  const normalizedTeacherId = teacherId.trim()
  if (!UUID_PATTERN.test(normalizedTeacherId)) {
    throw new TypeError("teacherId must be a canonical UUID")
  }
  if (!isPositiveInteger(estimatedTokens)) {
    throw new TypeError("estimatedTokens must be a positive safe integer")
  }

  const config = readAiConfig()
  if (!config.enabled) return { ok: false, code: "feature_disabled" }

  let transactionStarted = false

  try {
    await client.query("BEGIN")
    transactionStarted = true

    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended(
           $1::text || ':' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM'),
           0
         )
       )`,
      [normalizedTeacherId]
    )

    const profileResult = await client.query<TeacherProfileRow>(
      `SELECT
         user_type,
         professor_verification_status,
         account_status,
         deleted_at
       FROM public.profiles
       WHERE id = $1
       FOR SHARE`,
      [normalizedTeacherId]
    )

    const profile = profileResult.rows[0]
    if (!profile) {
      await client.query("COMMIT")
      return { ok: false, code: "professor_not_approved" }
    }
    if (profile.account_status !== "active" || profile.deleted_at !== null) {
      await client.query("COMMIT")
      return { ok: false, code: "account_inactive" }
    }
    if (
      profile.user_type !== "professor" ||
      profile.professor_verification_status !== "approved"
    ) {
      await client.query("COMMIT")
      return { ok: false, code: "professor_not_approved" }
    }

    const betaResult = await client.query<BetaAccessRow>(
      `SELECT enabled, daily_request_limit, monthly_token_limit
         FROM public.ai_beta_access
        WHERE teacher_id = $1
          AND enabled = TRUE
          AND (starts_at IS NULL OR starts_at <= clock_timestamp())
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
        LIMIT 1
        FOR SHARE`,
      [normalizedTeacherId]
    )

    const beta = betaResult.rows[0]
    if (!beta?.enabled) {
      await client.query("COMMIT")
      return { ok: false, code: "beta_disabled" }
    }

    const dailyLimit = positiveDailyLimit(beta.daily_request_limit, config.dailyRequests)
    const monthlyLimit = positiveMonthlyLimit(beta.monthly_token_limit, config.monthlyTokens)

    const usageResult = await client.query<MonthlyUsageRow>(
      `SELECT COALESCE(SUM(reserved_tokens + input_tokens + output_tokens), 0)::bigint AS used_tokens
         FROM public.ai_usage_daily
        WHERE teacher_id = $1
          AND usage_date >= DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
          AND usage_date < (
            DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month'
          )::date`,
      [normalizedTeacherId]
    )

    const monthlyUsage = nonNegativeUsage(usageResult.rows[0]?.used_tokens ?? 0)
    const requestedTokens = BigInt(estimatedTokens)
    if (monthlyUsage + requestedTokens > monthlyLimit) {
      await client.query("COMMIT")
      return { ok: false, code: "monthly_quota_exceeded" }
    }

    const reservationResult = await client.query(
      `INSERT INTO public.ai_usage_daily AS usage (
         teacher_id,
         usage_date,
         request_count,
         reserved_tokens
       )
       SELECT
         $1,
         (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
         1,
         $2::bigint
       WHERE $3::integer > 0
         AND $4::bigint + $2::bigint <= $5::bigint
       ON CONFLICT (teacher_id, usage_date) DO UPDATE
       SET request_count = usage.request_count + 1,
           reserved_tokens = usage.reserved_tokens + EXCLUDED.reserved_tokens
       WHERE usage.request_count < $3
         AND $4::bigint + $2::bigint <= $5::bigint
       RETURNING request_count`,
      [
        normalizedTeacherId,
        estimatedTokens,
        dailyLimit,
        monthlyUsage.toString(),
        monthlyLimit.toString(),
      ]
    )

    if (reservationResult.rowCount === 0) {
      await client.query("COMMIT")
      return { ok: false, code: "daily_quota_exceeded" }
    }

    await client.query("COMMIT")
    return { ok: true }
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}
