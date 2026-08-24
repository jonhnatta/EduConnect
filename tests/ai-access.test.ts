import assert from "node:assert/strict"
import test from "node:test"
import type { PoolClient, QueryResultRow } from "pg"
import { decideAiAccess, reserveAiUsage } from "../lib/ai/access.ts"

const VALID_TEACHER_ID = "123e4567-e89b-12d3-a456-426614174000"

const AI_ENV = {
  FEATURE_AI_COPILOT: "true",
  OPENAI_API_KEY: "test-openai-key",
  QDRANT_URL: "http://qdrant.test",
  QDRANT_API_KEY: "test-qdrant-key",
  LANGFUSE_BASE_URL: "http://langfuse.test",
  LANGFUSE_PUBLIC_KEY: "test-langfuse-public-key",
  LANGFUSE_SECRET_KEY: "test-langfuse-secret-key",
  AI_DAILY_REQUEST_LIMIT: "20",
  AI_MONTHLY_TOKEN_LIMIT: "1000000",
} as const

type AiEnvKey = keyof typeof AI_ENV

async function withAiEnv<T>(
  overrides: Partial<Record<AiEnvKey, string>>,
  work: () => Promise<T>
): Promise<T> {
  const previous = new Map<AiEnvKey, string | undefined>()

  for (const key of Object.keys(AI_ENV) as AiEnvKey[]) {
    previous.set(key, process.env[key])
    process.env[key] = overrides[key] ?? AI_ENV[key]
  }

  try {
    return await work()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function withEnabledAi<T>(work: () => Promise<T>): Promise<T> {
  return withAiEnv({}, work)
}

const allowedAccess = {
  approved: true,
  betaEnabled: true,
  featureEnabled: true,
  requests: 0,
  requestLimit: 20,
  tokens: 0,
  tokenLimit: 1_000_000,
}

test("AI access requires an approved professor", () => {
  assert.deepEqual(decideAiAccess({ ...allowedAccess, approved: false }), {
    ok: false,
    code: "professor_not_approved",
  })
})

test("AI access requires an enabled beta enrollment", () => {
  assert.deepEqual(decideAiAccess({ ...allowedAccess, betaEnabled: false }), {
    ok: false,
    code: "beta_disabled",
  })
})

test("AI access requires the global feature flag", () => {
  assert.deepEqual(decideAiAccess({ ...allowedAccess, featureEnabled: false }), {
    ok: false,
    code: "feature_disabled",
  })
})

test("AI access closes when the daily request quota has been reached", () => {
  assert.deepEqual(decideAiAccess({ ...allowedAccess, requests: 20 }), {
    ok: false,
    code: "daily_quota_exceeded",
  })
})

test("AI access closes when the monthly token quota has been reached", () => {
  assert.deepEqual(decideAiAccess({ ...allowedAccess, tokens: 1_000_000 }), {
    ok: false,
    code: "monthly_quota_exceeded",
  })
})

test("AI access permits a valid state below both quotas", () => {
  assert.deepEqual(decideAiAccess(allowedAccess), { ok: true })
})

test("AI access fails closed for invalid limits and counters", () => {
  for (const state of [
    { ...allowedAccess, requestLimit: 0 },
    { ...allowedAccess, requestLimit: 1.5 },
    { ...allowedAccess, tokenLimit: Number.NaN },
    { ...allowedAccess, requests: -1 },
    { ...allowedAccess, tokens: -1 },
  ]) {
    assert.deepEqual(decideAiAccess(state), {
      ok: false,
      code: "invalid_access_state",
    })
  }
})

type FakeResult = {
  rows?: QueryResultRow[]
  rowCount?: number | null
  error?: Error
}

class FakeClient {
  readonly calls: Array<{ sql: string; values: unknown[] }> = []
  private readonly results: FakeResult[]

  constructor(results: FakeResult[]) {
    this.results = [...results]
  }

  async query(sql: string, values: unknown[] = []) {
    this.calls.push({ sql, values })
    const result = this.results.shift()
    if (!result) throw new Error(`Unexpected query: ${sql}`)
    if (result.error) throw result.error
    return {
      command: "",
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
      oid: 0,
      fields: [],
      rows: result.rows ?? [],
    }
  }
}

function asPoolClient(client: FakeClient): PoolClient {
  return client as unknown as PoolClient
}

type BetaFixture = {
  enabled: boolean
  daily_request_limit: number | null
  monthly_token_limit: string | number | null
}

type ProfileFixture = {
  user_type: string
  professor_verification_status: string
  account_status: string
  deleted_at: string | null
}

const approvedProfile: ProfileFixture = {
  user_type: "professor",
  professor_verification_status: "approved",
  account_status: "active",
  deleted_at: null,
}

const activeBeta: BetaFixture = {
  enabled: true,
  daily_request_limit: null,
  monthly_token_limit: null,
}

function successfulReservationResults(beta: BetaFixture = activeBeta): FakeResult[] {
  return [
    {},
    {},
    { rows: [approvedProfile] },
    { rows: [beta] },
    { rows: [{ used_tokens: "100" }] },
    { rowCount: 1, rows: [{ reserved: 1 }] },
    {},
  ]
}

test("usage reservation executes the transaction in snapshot-safe order", async () => {
  const client = new FakeClient(successfulReservationResults())

  assert.deepEqual(
    await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
    { ok: true }
  )

  assert.deepEqual(client.calls.map(({ sql }) => sql.trim().split(/\s+/)[0].toUpperCase()), [
    "BEGIN",
    "SELECT",
    "SELECT",
    "SELECT",
    "SELECT",
    "INSERT",
    "COMMIT",
  ])
  assert.match(client.calls[1].sql, /pg_advisory_xact_lock/)
  assert.match(client.calls[1].sql, /YYYY-MM/)
  assert.match(client.calls[2].sql, /from public\.profiles/i)
  assert.match(client.calls[2].sql, /for share/i)
  assert.match(client.calls[3].sql, /from public\.ai_beta_access/i)
  assert.match(client.calls[3].sql, /starts_at is null or starts_at <= clock_timestamp\(\)/i)
  assert.match(client.calls[3].sql, /expires_at is null or expires_at > clock_timestamp\(\)/i)
  assert.match(client.calls[3].sql, /for share/i)
  assert.match(client.calls[4].sql, /sum\(reserved_tokens \+ input_tokens \+ output_tokens\)/i)
  assert.match(client.calls[4].sql, /current_timestamp at time zone 'UTC'/i)
  assert.match(client.calls[5].sql, /insert into public\.ai_usage_daily as usage/i)
  assert.match(client.calls[5].sql, /on conflict \(teacher_id, usage_date\) do update/i)
  assert.match(client.calls[5].sql, /request_count < \$3/i)
  assert.match(client.calls[5].sql, /\$4::bigint \+ \$2::bigint <= \$5::bigint/i)
  assert.deepEqual(client.calls[1].values, [VALID_TEACHER_ID])
  assert.deepEqual(client.calls[2].values, [VALID_TEACHER_ID])
  assert.deepEqual(client.calls[3].values, [VALID_TEACHER_ID])
  assert.deepEqual(client.calls[5].values, [VALID_TEACHER_ID, 250, 20, "100", "1000000"])
  assert.equal(client.calls.some(({ sql }) => sql.includes(VALID_TEACHER_ID)), false)
})

test("usage reservation honors the disabled feature flag before BEGIN", async () => {
  const client = new FakeClient([])

  assert.deepEqual(
    await withAiEnv(
      { FEATURE_AI_COPILOT: "false" },
      () => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)
    ),
    { ok: false, code: "feature_disabled" }
  )
  assert.equal(client.calls.length, 0)
})

test("usage reservation preserves invalid enabled configuration before BEGIN", async () => {
  const client = new FakeClient([])

  await assert.rejects(
    () => withAiEnv(
      { OPENAI_API_KEY: "" },
      () => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)
    ),
    /Invalid AI configuration/
  )
  assert.equal(client.calls.length, 0)
})

test("usage reservation rejects a revoked professor before reading beta access", async () => {
  const client = new FakeClient([
    {},
    {},
    { rows: [{ ...approvedProfile, professor_verification_status: "revoked" }] },
    {},
  ])

  assert.deepEqual(
    await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
    { ok: false, code: "professor_not_approved" }
  )
  assert.equal(client.calls.some(({ sql }) => /ai_beta_access/i.test(sql)), false)
  assert.equal(client.calls.at(-1)?.sql, "COMMIT")
})

test("usage reservation rejects a missing professor profile", async () => {
  const client = new FakeClient([{}, {}, { rows: [] }, {}])

  assert.deepEqual(
    await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
    { ok: false, code: "professor_not_approved" }
  )
  assert.equal(client.calls.some(({ sql }) => /ai_beta_access/i.test(sql)), false)
  assert.equal(client.calls.at(-1)?.sql, "COMMIT")
})

test("usage reservation rejects suspended and deleted profiles as inactive", async () => {
  for (const profile of [
    { ...approvedProfile, account_status: "suspended" },
    { ...approvedProfile, deleted_at: "2026-08-24T12:00:00Z" },
  ]) {
    const client = new FakeClient([{}, {}, { rows: [profile] }, {}])

    assert.deepEqual(
      await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
      { ok: false, code: "account_inactive" }
    )
    assert.equal(client.calls.some(({ sql }) => /ai_beta_access/i.test(sql)), false)
    assert.equal(client.calls.at(-1)?.sql, "COMMIT")
  }
})

test("usage reservation commits beta_disabled when enrollment is absent", async () => {
  const client = new FakeClient([{}, {}, { rows: [approvedProfile] }, { rows: [] }, {}])

  assert.deepEqual(
    await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
    { ok: false, code: "beta_disabled" }
  )
  assert.equal(client.calls.at(-1)?.sql, "COMMIT")
})

test("usage reservation returns monthly quota before writing", async () => {
  const client = new FakeClient([
    {},
    {},
    { rows: [approvedProfile] },
    { rows: [activeBeta] },
    { rows: [{ used_tokens: "999900" }] },
    {},
  ])

  assert.deepEqual(
    await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 101)),
    { ok: false, code: "monthly_quota_exceeded" }
  )
  assert.equal(client.calls.some(({ sql }) => /^\s*insert/i.test(sql)), false)
  assert.equal(client.calls.at(-1)?.sql, "COMMIT")
})

test("usage reservation reports daily quota when the guarded upsert writes no row", async () => {
  const client = new FakeClient([
    {},
    {},
    { rows: [approvedProfile] },
    { rows: [activeBeta] },
    { rows: [{ used_tokens: "100" }] },
    { rowCount: 0 },
    {},
  ])

  assert.deepEqual(
    await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
    { ok: false, code: "daily_quota_exceeded" }
  )
  assert.equal(client.calls.at(-1)?.sql, "COMMIT")
})

test("usage reservation applies positive beta quota overrides", async () => {
  const client = new FakeClient(successfulReservationResults({
    enabled: true,
    daily_request_limit: 7,
    monthly_token_limit: "2000",
  }))

  assert.deepEqual(
    await withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
    { ok: true }
  )
  assert.deepEqual(client.calls[5].values, [VALID_TEACHER_ID, 250, 7, "100", "2000"])
})

test("usage reservation validates arguments before BEGIN", async () => {
  for (const [teacherId, tokens] of [["", 1], ["   ", 1], [VALID_TEACHER_ID, 0], [VALID_TEACHER_ID, 1.5]] as const) {
    const client = new FakeClient([])

    await assert.rejects(() => reserveAiUsage(asPoolClient(client), teacherId, tokens), TypeError)
    assert.equal(client.calls.length, 0)
  }
})

test("usage reservation rejects a non-UUID teacher id before BEGIN", async () => {
  const client = new FakeClient([])

  await assert.rejects(
    () => reserveAiUsage(asPoolClient(client), "teacher-1", 250),
    TypeError
  )
  assert.equal(client.calls.length, 0)
})

test("usage reservation rolls back and preserves database errors", async () => {
  const failure = new Error("database unavailable")
  const client = new FakeClient([{}, {}, { error: failure }, {}])

  await assert.rejects(
    () => withEnabledAi(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250)),
    failure
  )
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK")
})
