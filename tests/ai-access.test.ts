import assert from "node:assert/strict"
import test from "node:test"
import type { PoolClient, QueryResultRow } from "pg"
import { decideAiAccess, reserveAiUsage } from "../lib/ai/access.ts"

const VALID_TEACHER_ID = "123e4567-e89b-12d3-a456-426614174000"

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

const activeBeta: BetaFixture = {
  enabled: true,
  daily_request_limit: null,
  monthly_token_limit: null,
}

function successfulReservationResults(beta: BetaFixture = activeBeta): FakeResult[] {
  return [
    {},
    {},
    { rows: [beta] },
    { rows: [{ used_tokens: "100" }] },
    { rowCount: 1, rows: [{ reserved: 1 }] },
    {},
  ]
}

test("usage reservation executes the transaction in snapshot-safe order", async () => {
  const client = new FakeClient(successfulReservationResults())

  assert.deepEqual(await reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250), { ok: true })

  assert.deepEqual(client.calls.map(({ sql }) => sql.trim().split(/\s+/)[0].toUpperCase()), [
    "BEGIN",
    "SELECT",
    "SELECT",
    "SELECT",
    "INSERT",
    "COMMIT",
  ])
  assert.match(client.calls[1].sql, /pg_advisory_xact_lock/)
  assert.match(client.calls[1].sql, /YYYY-MM/)
  assert.match(client.calls[2].sql, /from public\.ai_beta_access/i)
  assert.match(client.calls[2].sql, /starts_at is null or starts_at <= clock_timestamp\(\)/i)
  assert.match(client.calls[2].sql, /expires_at is null or expires_at > clock_timestamp\(\)/i)
  assert.match(client.calls[3].sql, /sum\(reserved_tokens \+ input_tokens \+ output_tokens\)/i)
  assert.match(client.calls[3].sql, /current_timestamp at time zone 'UTC'/i)
  assert.match(client.calls[4].sql, /insert into public\.ai_usage_daily as usage/i)
  assert.match(client.calls[4].sql, /on conflict \(teacher_id, usage_date\) do update/i)
  assert.match(client.calls[4].sql, /request_count < \$3/i)
  assert.match(client.calls[4].sql, /\$4::bigint \+ \$2::bigint <= \$5::bigint/i)
  assert.deepEqual(client.calls[1].values, [VALID_TEACHER_ID])
  assert.deepEqual(client.calls[4].values, [VALID_TEACHER_ID, 250, 20, "100", "1000000"])
  assert.equal(client.calls.some(({ sql }) => sql.includes(VALID_TEACHER_ID)), false)
})

test("usage reservation commits beta_disabled when enrollment is absent", async () => {
  const client = new FakeClient([{}, {}, { rows: [] }, {}])

  assert.deepEqual(await reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250), {
    ok: false,
    code: "beta_disabled",
  })
  assert.deepEqual(client.calls.map(({ sql }) => sql.trim().toUpperCase()), [
    "BEGIN",
    client.calls[1].sql.trim().toUpperCase(),
    client.calls[2].sql.trim().toUpperCase(),
    "COMMIT",
  ])
})

test("usage reservation returns monthly quota before writing", async () => {
  const client = new FakeClient([
    {},
    {},
    { rows: [activeBeta] },
    { rows: [{ used_tokens: "999900" }] },
    {},
  ])

  assert.deepEqual(await reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 101), {
    ok: false,
    code: "monthly_quota_exceeded",
  })
  assert.equal(client.calls.some(({ sql }) => /^\s*insert/i.test(sql)), false)
  assert.equal(client.calls.at(-1)?.sql, "COMMIT")
})

test("usage reservation reports daily quota when the guarded upsert writes no row", async () => {
  const client = new FakeClient([
    {},
    {},
    { rows: [activeBeta] },
    { rows: [{ used_tokens: "100" }] },
    { rowCount: 0 },
    {},
  ])

  assert.deepEqual(await reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250), {
    ok: false,
    code: "daily_quota_exceeded",
  })
  assert.equal(client.calls.at(-1)?.sql, "COMMIT")
})

test("usage reservation applies positive beta quota overrides", async () => {
  const client = new FakeClient(successfulReservationResults({
    enabled: true,
    daily_request_limit: 7,
    monthly_token_limit: "2000",
  }))

  assert.deepEqual(await reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250), { ok: true })
  assert.deepEqual(client.calls[4].values, [VALID_TEACHER_ID, 250, 7, "100", "2000"])
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

  await assert.rejects(() => reserveAiUsage(asPoolClient(client), VALID_TEACHER_ID, 250), failure)
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK")
})
