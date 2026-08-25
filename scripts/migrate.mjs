import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import pg from "pg"

const MIGRATIONS = [
  ["00100", "bootstrap", "scripts/100_bootstrap_postgres.sql"],
  ["00200", "app_schema_baseline", "scripts/200_app_schema_postgres.sql"],
  ["00210", "oauth_users", "scripts/016_oauth_users.sql"],
  ["00220", "student_onboarding", "scripts/016_student_onboarding.sql"],
  ["00230", "content_comments", "scripts/017_content_comments.sql"],
  ["00240", "content_views", "scripts/018_content_views.sql"],
  ["00250", "password_reset", "scripts/019_password_reset_codes.sql"],
  ["00260", "content_saves", "scripts/020_content_saves.sql"],
  ["00270", "student_public_profiles", "scripts/021_student_public_profiles.sql"],
  ["00280", "teacher_followers", "scripts/022_teacher_followers.sql"],
  ["00290", "profile_website", "scripts/023_profile_website_url.sql"],
  ["00300", "terms_consent", "scripts/025_terms_consent.sql"],
  ["00310", "professor_verification", "scripts/026_professor_verification_ai.sql"],
  ["00320", "feed_ranking", "scripts/027_feed_follow_ranking.sql"],
  ["00330", "notification_preferences", "scripts/028_notification_prefs.sql"],
  ["00340", "professor_reviews", "scripts/029_professor_reviews.sql"],
  ["00350", "notifications", "scripts/030_notifications.sql"],
  ["00360", "account_deletion", "scripts/031_account_deletion.sql"],
  ["00370", "classroom_visibility", "scripts/032_classroom_visibility.sql"],
  ["00380", "notification_constraints", "scripts/033_notification_constraints.sql"],
  ["00390", "password_change_limits", "scripts/034_password_change_limits.sql"],
  ["00400", "notification_submission_type", "scripts/035_notification_submission_type.sql"],
  ["00410", "trabalho_submissions", "scripts/036_trabalho_submissions.sql"],
  ["00420", "content_audience", "scripts/037_content_audience.sql"],
  ["00430", "content_audience_visibility", "scripts/038_content_audience_visibility.sql"],
  ["00440", "rate_limits", "scripts/039_rate_limits.sql"],
  ["00450", "queue_outbox", "scripts/041_queue_outbox.sql"],
  ["00460", "session_security", "scripts/042_session_security.sql"],
  ["00470", "email_delivery", "scripts/043_email_delivery.sql"],
  ["00480", "professor_backoffice", "scripts/044_professor_backoffice.sql"],
  ["00490", "operational_health", "scripts/045_operational_health.sql"],
  ["00500", "invite_capacity", "scripts/046_invite_capacity.sql"],
  ["00510", "content_submission_access", "scripts/047_content_submission_access.sql"],
  ["00520", "content_engagement_notifications", "scripts/048_content_engagement_notifications.sql"],
  ["00530", "feed_keyset_pagination", "scripts/049_feed_keyset_pagination.sql", "concurrent-indexes"],
  ["00540", "legal_consent_versions", "scripts/050_legal_consent_versions.sql"],
  ["00550", "trust_safety_reports", "scripts/051_trust_safety_reports.sql"],
  ["00560", "ai_foundation", "scripts/052_ai_foundation.sql"],
  ["00570", "ai_knowledge", "scripts/053_ai_knowledge.sql"],
  ["00580", "ai_copilot_feedback", "scripts/054_ai_copilot_feedback.sql"],
  ["00590", "ai_copilot_citation_excerpt", "scripts/055_ai_copilot_citation_excerpt.sql"],
  ["00600", "ai_copilot_hardening", "scripts/056_ai_copilot_hardening.sql"],
  ["00610", "ai_lesson_plan_proposals", "scripts/057_ai_lesson_plan_proposals.sql"],
]

const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
if (!databaseUrl) throw new Error("Missing DATABASE_MIGRATION_URL")

function sslOption() {
  if (process.env.DATABASE_SSL === "false") return false
  if (process.env.DATABASE_SSL_CA) {
    return { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA.replaceAll("\\n", "\n") }
  }
  return { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== "true" }
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: sslOption() })

function quotedIdentifier(value, variableName) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`${variableName} must be a lowercase PostgreSQL identifier`)
  }
  return `"${value}"`
}

async function concurrentIndexState(indexName) {
  const result = await client.query(
    `select
       i.indisvalid,
       i.indisready,
       obj_description(c.oid, 'pg_class') as comment
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_index i on i.indexrelid = c.oid
     where n.nspname = 'public'
       and c.relname = $1`,
    [indexName]
  )
  return result.rows[0] ?? null
}

async function applyConcurrentIndexes(version, sql) {
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    const match = statement.match(
      /create\s+index\s+concurrently\s+if\s+not\s+exists\s+([a-z_][a-z0-9_]*)/i
    )
    if (!match) {
      throw new Error(
        `Nontransactional migration ${version} contains an unsupported statement`
      )
    }

    const indexName = match[1].toLowerCase()
    const index = quotedIdentifier(indexName, "migration index name")
    const marker = `educonnect:index:${version}:${createHash("sha256").update(statement).digest("hex")}`
    let state = await concurrentIndexState(indexName)

    // CREATE INDEX CONCURRENTLY pode deixar um índice INVALID após interrupção.
    // Um índice sem o marcador da definição atual também é reconstruído para que
    // IF NOT EXISTS nunca esconda uma definição parcial ou homônima incorreta.
    if (
      state &&
      (state.indisvalid !== true || state.indisready !== true || state.comment !== marker)
    ) {
      await client.query(`drop index concurrently if exists public.${index}`)
      state = null
    }

    if (!state) {
      await client.query(statement)
      const markerLiteral = (
        await client.query("select quote_literal($1)::text as value", [marker])
      ).rows[0].value
      await client.query(`comment on index public.${index} is ${markerLiteral}`)
    }

    const applied = await concurrentIndexState(indexName)
    if (
      !applied ||
      applied.indisvalid !== true ||
      applied.indisready !== true ||
      applied.comment !== marker
    ) {
      throw new Error(`Concurrent index ${indexName} was not created successfully`)
    }
  }
}

async function provisionRuntimeRole() {
  const roleName = process.env.DATABASE_RUNTIME_USER
  const password = process.env.DATABASE_RUNTIME_PASSWORD
  if (!roleName && !password) return
  if (!roleName || !password) {
    throw new Error("DATABASE_RUNTIME_USER and DATABASE_RUNTIME_PASSWORD must be set together")
  }

  const role = quotedIdentifier(roleName, "DATABASE_RUNTIME_USER")
  const passwordLiteral = (
    await client.query("select quote_literal($1)::text as value", [password])
  ).rows[0].value
  const exists = await client.query("select 1 from pg_roles where rolname = $1", [roleName])
  if (!exists.rowCount) {
    await client.query(`create role ${role} login`)
  }
  await client.query(
    `alter role ${role} with login password ${passwordLiteral}
       nosuperuser nocreatedb nocreaterole noinherit bypassrls`
  )

  const database = (
    await client.query("select quote_ident(current_database()) as name")
  ).rows[0].name
  await client.query(`grant connect on database ${database} to ${role}`)
  await client.query(`grant usage on schema public to ${role}`)
  await client.query(`grant select, insert, update, delete on all tables in schema public to ${role}`)
  await client.query(`grant usage, select, update on all sequences in schema public to ${role}`)
  await client.query(`grant execute on all functions in schema public to ${role}`)
  await client.query(
    `alter default privileges in schema public
       grant select, insert, update, delete on tables to ${role}`
  )
  await client.query(
    `alter default privileges in schema public
       grant usage, select, update on sequences to ${role}`
  )
  await client.query(
    `alter default privileges in schema public grant execute on functions to ${role}`
  )
  await client.query(
    `revoke insert, update, delete, truncate, references, trigger
       on public.schema_migrations from ${role}`
  )
  await client.query(`revoke update, delete, truncate on public.professor_verification_reviews from ${role}`)
  await client.query(`revoke update, delete, truncate on public.admin_audit_events from ${role}`)
  console.info(JSON.stringify({ event: "database.runtime_role_ready", role: roleName }))
}

try {
  await client.connect()
  await client.query("select pg_advisory_lock(hashtext('educonnect:schema-migrations'))")
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      execution_ms integer not null,
      applied_at timestamptz not null default timezone('utc'::text, now())
    )
  `)

  for (const [version, name, filename, mode] of MIGRATIONS) {
    const sql = await readFile(resolve(process.cwd(), filename), "utf8")
    const checksum = createHash("sha256").update(sql).digest("hex")
    const applied = await client.query(
      "select checksum from public.schema_migrations where version = $1",
      [version]
    )

    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum) {
        throw new Error(`Checksum mismatch for migration ${version} (${name})`)
      }
      continue
    }

    const started = Date.now()
    if (mode === "concurrent-indexes") {
      // O advisory lock continua serializando deploys, mas cada índice precisa
      // de sua própria transação implícita para usar CONCURRENTLY.
      await applyConcurrentIndexes(version, sql)
      await client.query(
        `insert into public.schema_migrations (version, name, checksum, execution_ms)
         values ($1, $2, $3, $4)`,
        [version, name, checksum, Date.now() - started]
      )
      console.info(JSON.stringify({ event: "migration.applied", version, name }))
      continue
    }

    await client.query("begin")
    try {
      await client.query(sql)
      await client.query(
        `insert into public.schema_migrations (version, name, checksum, execution_ms)
         values ($1, $2, $3, $4)`,
        [version, name, checksum, Date.now() - started]
      )
      await client.query("commit")
      console.info(JSON.stringify({ event: "migration.applied", version, name }))
    } catch (error) {
      await client.query("rollback")
      throw error
    }
  }
  await provisionRuntimeRole()
} finally {
  await client.query("select pg_advisory_unlock(hashtext('educonnect:schema-migrations'))").catch(() => {})
  await client.end().catch(() => {})
}
