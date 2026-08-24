import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const migrationUrl = new URL("../scripts/052_ai_foundation.sql", import.meta.url)
const baselineUrl = new URL("../scripts/200_app_schema_postgres.sql", import.meta.url)
const migrateRunnerUrl = new URL("../scripts/migrate.mjs", import.meta.url)
const baselineMarker = "-- 052_ai_foundation.sql"

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function migrationSource() {
  assert.ok(existsSync(migrationUrl), "scripts/052_ai_foundation.sql must exist")
  return readFileSync(migrationUrl, "utf8")
}

test("AI foundation migration creates all transactional tables", () => {
  const sql = normalized(migrationSource())
  const tables = [
    "ai_beta_access",
    "ai_conversations",
    "ai_messages",
    "ai_runs",
    "ai_tool_executions",
    "ai_citations",
    "ai_draft_actions",
    "ai_usage_daily",
    "ai_documents",
  ]

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table} \\(`))
  }
})

test("AI foundation schema protects ownership and child lifecycles", () => {
  const sql = normalized(migrationSource())

  assert.match(sql, /ai_beta_access \([^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*unique \(teacher_id\)/)
  assert.match(sql, /ai_conversations \([^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*classroom_id uuid references public\.classrooms\(id\) on delete set null[^;]*unique \(id, teacher_id\)/)
  assert.match(sql, /ai_messages \([^;]*conversation_id uuid not null references public\.ai_conversations\(id\) on delete cascade[^;]*unique \(id, conversation_id\)/)
  assert.match(sql, /ai_runs \([^;]*conversation_id uuid not null[^;]*message_id uuid[^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*foreign key \(conversation_id, teacher_id\) references public\.ai_conversations\(id, teacher_id\) on delete cascade[^;]*foreign key \(message_id, conversation_id\) references public\.ai_messages\(id, conversation_id\) on delete cascade/)
  assert.match(sql, /ai_tool_executions \([^;]*run_id uuid not null references public\.ai_runs\(id\) on delete cascade/)
  assert.match(sql, /ai_citations \([^;]*message_id uuid not null references public\.ai_messages\(id\) on delete cascade/)
  assert.match(sql, /ai_draft_actions \([^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*conversation_id uuid not null[^;]*foreign key \(conversation_id, teacher_id\) references public\.ai_conversations\(id, teacher_id\) on delete cascade/)
  assert.match(sql, /ai_documents \([^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*classroom_id uuid references public\.classrooms\(id\) on delete set null/)
})

test("AI states, counters and draft confirmation invariants are constrained", () => {
  const sql = normalized(migrationSource())

  assert.match(sql, /ai_conversations \([^;]*status text not null default 'active' check \(status in \('active', 'archived', 'deleted'\)\)/)
  assert.match(sql, /ai_messages \([^;]*status text not null default 'pending' check \(status in \('pending', 'streaming', 'completed', 'failed', 'cancelled', 'blocked'\)\)/)
  assert.match(sql, /ai_draft_actions \([^;]*payload_hash text not null[^;]*status text not null default 'proposed' check \(status in \('proposed', 'confirmed', 'applied', 'expired', 'rejected', 'failed'\)\)[^;]*expires_at timestamptz not null/)
  assert.match(sql, /check \(expires_at > created_at\)/)
  assert.match(sql, /check \(\(status in \('confirmed', 'applied'\) and confirmed_at is not null\) or \(status in \('proposed', 'rejected'\) and confirmed_at is null\) or status in \('expired', 'failed'\)\)/)
  assert.match(sql, /applied_at timestamptz/)
  assert.match(sql, /check \(\(status = 'applied' and applied_at is not null\) or \(status <> 'applied' and applied_at is null\)\)/)
  assert.match(sql, /check \(applied_at is null or \(applied_at >= confirmed_at and applied_at < expires_at\)\)/)
  assert.doesNotMatch(sql, /confirmation_token|plaintext_token|plain_text_token/)
  assert.match(sql, /ai_documents \([^;]*version integer not null check \(version > 0\)[^;]*status text not null default 'pending' check \(status in \('pending', 'extracting', 'embedding', 'indexed', 'failed', 'deleting', 'deleted'\)\)/)
})

test("AI usage ledger has the exact planned counters and daily uniqueness", () => {
  const sql = normalized(migrationSource())
  const usage = sql.match(/create table if not exists public\.ai_usage_daily \(([^;]+)\);/)?.[1]

  assert.ok(usage, "ai_usage_daily definition must exist")
  assert.match(usage, /id uuid primary key default gen_random_uuid\(\)/)
  assert.match(usage, /teacher_id uuid not null references public\.profiles\(id\) on delete cascade/)
  assert.match(usage, /usage_date date not null/)
  assert.match(usage, /request_count integer not null default 0 check \(request_count >= 0\)/)
  for (const counter of [
    "reserved_tokens",
    "input_tokens",
    "output_tokens",
    "estimated_cost_micros",
  ]) {
    assert.match(usage, new RegExp(`${counter} bigint not null default 0 check \\(${counter} >= 0\\)`))
  }
  assert.match(usage, /updated_at timestamptz not null default timezone\('utc'::text, now\(\)\)/)
  assert.match(usage, /unique \(teacher_id, usage_date\)/)
})

test("AI schema adds operational indexes", () => {
  const sql = normalized(migrationSource())

  for (const column of ["teacher_id", "conversation_id", "status", "created_at", "expires_at"]) {
    assert.match(sql, new RegExp(`create (?:unique )?index if not exists [^;]+\\([^;]*${column}[^;]*\\)`))
  }
  assert.match(sql, /create index if not exists idx_ai_runs_message on public\.ai_runs \(message_id, conversation_id\) where message_id is not null/)
  assert.match(sql, /unique \(message_id, display_order\)/)
  assert.match(sql, /unique \(teacher_id, source_type, source_id, version\)/)
})

test("migration runner registers AI foundation as version 00560", () => {
  const runner = normalized(readFileSync(migrateRunnerUrl, "utf8"))
  assert.match(runner, /\["00560", "ai_foundation", "scripts\/052_ai_foundation\.sql"\]/)
})

test("PostgreSQL baseline mirrors the complete AI foundation migration", () => {
  const migration = migrationSource().trim()
  const baseline = readFileSync(baselineUrl, "utf8")
  const markerIndex = baseline.lastIndexOf(baselineMarker)

  assert.ok(markerIndex >= 0, `baseline must contain ${baselineMarker}`)
  assert.equal(baseline.slice(markerIndex + baselineMarker.length).trim(), migration)
})
