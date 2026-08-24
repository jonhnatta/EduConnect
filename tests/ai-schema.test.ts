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
  assert.match(sql, /create unique index if not exists uq_classrooms_id_professor on public\.classrooms \(id, professor_id\)/)
  assert.match(sql, /ai_conversations \([^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*classroom_id uuid[^;]*unique \(id, teacher_id\)[^;]*foreign key \(classroom_id, teacher_id\) references public\.classrooms\(id, professor_id\) on delete set null \(classroom_id\)/)
  assert.match(sql, /ai_messages \([^;]*conversation_id uuid not null references public\.ai_conversations\(id\) on delete cascade[^;]*unique \(id, conversation_id\)/)
  assert.match(sql, /ai_runs \([^;]*conversation_id uuid not null[^;]*message_id uuid[^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*foreign key \(conversation_id, teacher_id\) references public\.ai_conversations\(id, teacher_id\) on delete cascade[^;]*foreign key \(message_id, conversation_id\) references public\.ai_messages\(id, conversation_id\) on delete cascade/)
  assert.match(sql, /ai_tool_executions \([^;]*run_id uuid not null references public\.ai_runs\(id\) on delete cascade/)
  assert.match(sql, /ai_citations \([^;]*message_id uuid not null references public\.ai_messages\(id\) on delete cascade/)
  assert.match(sql, /ai_draft_actions \([^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*conversation_id uuid not null[^;]*foreign key \(conversation_id, teacher_id\) references public\.ai_conversations\(id, teacher_id\) on delete cascade/)
  assert.match(sql, /ai_documents \([^;]*teacher_id uuid not null references public\.profiles\(id\) on delete cascade[^;]*classroom_id uuid[^;]*foreign key \(classroom_id, teacher_id\) references public\.classrooms\(id, professor_id\) on delete set null \(classroom_id\)/)
})

test("AI states, counters and draft confirmation invariants are constrained", () => {
  const sql = normalized(migrationSource())

  assert.match(sql, /ai_conversations \([^;]*status text not null default 'active' check \(status in \('active', 'archived', 'deleted'\)\)/)
  assert.match(sql, /ai_messages \([^;]*status text not null default 'pending' check \(status in \('pending', 'streaming', 'completed', 'failed', 'cancelled', 'blocked'\)\)/)
  assert.match(sql, /ai_draft_actions \([^;]*payload_hash text not null[^;]*status text not null default 'proposed' check \(status in \('proposed', 'confirmed', 'applied', 'expired', 'rejected', 'failed'\)\)[^;]*expires_at timestamptz not null/)
  assert.match(sql, /check \(expires_at > created_at\)/)
  assert.match(sql, /check \(\(status in \('confirmed', 'applied'\) and confirmed_at is not null\) or \(status = 'proposed' and confirmed_at is null\) or status in \('expired', 'rejected', 'failed'\)\)/)
  assert.match(sql, /applied_at timestamptz/)
  assert.match(sql, /check \(\(status = 'applied' and applied_at is not null\) or \(status <> 'applied' and applied_at is null\)\)/)
  assert.match(sql, /check \(applied_at is null or \(applied_at >= confirmed_at and applied_at < expires_at\)\)/)
  assert.doesNotMatch(sql, /confirmation_token|plaintext_token|plain_text_token/)
  assert.match(sql, /ai_documents \([^;]*version integer not null check \(version > 0\)[^;]*status text not null default 'pending' check \(status in \('pending', 'extracting', 'embedding', 'indexed', 'failed', 'deleting', 'deleted'\)\)/)
})

test("AI beta access uses the monthly token quota contract", () => {
  const sql = normalized(migrationSource())
  const betaAccess = sql.match(/create table if not exists public\.ai_beta_access \(([^;]+)\);/)?.[1]

  assert.ok(betaAccess, "ai_beta_access definition must exist")
  assert.match(betaAccess, /monthly_token_limit bigint check \(monthly_token_limit is null or monthly_token_limit > 0\)/)
  assert.doesNotMatch(betaAccess, /daily_token_limit/)
})

test("AI runs store fractional estimated cost", () => {
  const sql = normalized(migrationSource())
  const runs = sql.match(/create table if not exists public\.ai_runs \(([^;]+)\);/)?.[1]

  assert.ok(runs, "ai_runs definition must exist")
  assert.match(runs, /estimated_cost numeric\(18,8\) not null default 0 check \(estimated_cost >= 0\)/)
  assert.doesNotMatch(runs, /estimated_cost_micros/)
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
  assert.doesNotMatch(sql, /create index if not exists idx_ai_citations_message/)
  assert.match(sql, /unique \(teacher_id, source_type, source_id, version\)/)
})

test("AI updated timestamps are maintained by database triggers", () => {
  const sql = normalized(migrationSource())

  for (const table of ["ai_beta_access", "ai_conversations", "ai_usage_daily", "ai_documents"]) {
    assert.match(
      sql,
      new RegExp(`create trigger handle_${table}_updated_at before update on public\\.${table} for each row execute function public\\.handle_updated_at\\(\\)`)
    )
  }
})

test("AI draft actions enforce immutable payload and server-authoritative transitions", () => {
  const sql = normalized(migrationSource())
  const functionBody = sql.match(/create or replace function public\.enforce_ai_draft_action_transition\(\) returns trigger[^$]+\$\$ ([\s\S]+?) \$\$;/)?.[1]

  assert.ok(functionBody, "draft transition function must exist")
  for (const field of [
    "id",
    "teacher_id",
    "conversation_id",
    "action_type",
    "target_type",
    "target_id",
    "payload",
    "payload_hash",
    "expires_at",
    "created_at",
  ]) {
    assert.match(functionBody, new RegExp(`new\\.${field}`))
    assert.match(functionBody, new RegExp(`old\\.${field}`))
  }
  assert.match(functionBody, /if tg_op = 'insert' then/)
  assert.match(functionBody, /new\.status <> 'proposed'/)
  assert.match(functionBody, /new\.confirmed_at is not null or new\.applied_at is not null/)
  assert.match(functionBody, /old\.status = 'proposed' and new\.status in \('proposed', 'confirmed', 'rejected', 'expired', 'failed'\)/)
  assert.match(functionBody, /old\.status = 'confirmed' and new\.status in \('confirmed', 'applied', 'rejected', 'expired', 'failed'\)/)
  assert.match(functionBody, /old\.status in \('applied', 'expired', 'rejected', 'failed'\)/)
  assert.match(functionBody, /v_now timestamptz := clock_timestamp\(\)/)
  assert.match(functionBody, /timezone\('utc'::text, now\(\)\) >= timezone\('utc'::text, new\.expires_at\)/)
  assert.match(functionBody, /timezone\('utc'::text, v_now\) >= timezone\('utc'::text, new\.expires_at\)/)
  assert.match(functionBody, /new\.confirmed_at is not null/)
  assert.match(functionBody, /new\.applied_at is not null/)
  assert.match(functionBody, /new\.confirmed_at := v_now/)
  assert.match(functionBody, /new\.applied_at := v_now/)
  assert.match(sql, /create trigger enforce_ai_draft_action_transition before insert or update on public\.ai_draft_actions for each row execute function public\.enforce_ai_draft_action_transition\(\)/)
})

test("migration runner registers AI foundation as version 00560", () => {
  const runner = normalized(readFileSync(migrateRunnerUrl, "utf8"))
  const registrations = runner.match(/\["00560", "ai_foundation", "scripts\/052_ai_foundation\.sql"\]/g) ?? []

  assert.equal(registrations.length, 1)
})

test("historical PostgreSQL baseline remains independent from migration 00560", () => {
  const baseline = readFileSync(baselineUrl, "utf8")

  assert.equal(baseline.includes(baselineMarker), false)
  assert.doesNotMatch(baseline, /create table if not exists public\.ai_beta_access/i)
})
