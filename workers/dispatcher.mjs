import { randomUUID } from "node:crypto"
import { Queue } from "bullmq"
import pg from "pg"
import { log, logError, redisConnection } from "./runtime.mjs"

const databaseUrl = process.env.DATABASE_URL
const redisUrl = process.env.REDIS_QUEUE_URL
const namespace = process.env.REDIS_NAMESPACE
if (!databaseUrl) throw new Error("Missing env var: DATABASE_URL")
if (!redisUrl) throw new Error("Missing env var: REDIS_QUEUE_URL")
if (!namespace) throw new Error("Missing env var: REDIS_NAMESPACE")

const dispatcherId = randomUUID()
const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
  max: 2,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 15_000,
  query_timeout: 20_000,
  lock_timeout: 5_000,
  idle_in_transaction_session_timeout: 30_000,
  application_name: "educonnect-dispatcher",
})
pool.on("error", (error) => logError("database.pool.error", error))
const queues = new Map()
let stopping = false
let lastHeartbeat = 0

async function heartbeat(status = "ready") {
  await pool.query(
    `insert into public.service_heartbeats
       (service_name, instance_id, status, heartbeat_at)
     values ('dispatcher', $1, $2, timezone('utc'::text, now()))
     on conflict (service_name) do update set
       instance_id = excluded.instance_id, status = excluded.status,
       heartbeat_at = excluded.heartbeat_at`,
    [dispatcherId, status]
  )
  lastHeartbeat = Date.now()
}

function queue(name) {
  let instance = queues.get(name)
  if (!instance) {
    instance = new Queue(name, {
      connection: redisConnection(redisUrl),
      prefix: namespace,
      defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 1_000 } },
    })
    queues.set(name, instance)
  }
  return instance
}

async function claimBatch() {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `select id, queue_name, event_type, schema_version, correlation_id,
              aggregate_type, aggregate_id, aggregate_version, payload, attempts
         from public.outbox_events
        where published_at is null
          and available_at <= timezone('utc'::text, now())
          and (locked_at is null or locked_at < timezone('utc'::text, now()) - interval '5 minutes')
        order by created_at
        for update skip locked
        limit 50`
    )
    if (result.rowCount) {
      await client.query(
        `update public.outbox_events
            set locked_at = timezone('utc'::text, now()), locked_by = $2, attempts = attempts + 1
          where id = any($1::uuid[])`,
        [result.rows.map((row) => row.id), dispatcherId]
      )
    }
    await client.query("commit")
    return result.rows
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function dispatch(row) {
  try {
    await queue(row.queue_name).add(row.event_type, {
      ...row.payload,
      meta: {
        eventId: row.id,
        schemaVersion: row.schema_version,
        correlationId: row.correlation_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        aggregateVersion: row.aggregate_version,
      },
    }, {
      jobId: row.id,
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: false,
    })
    await pool.query(
      `update public.outbox_events
          set published_at = timezone('utc'::text, now()), locked_at = null, locked_by = null, last_error = null
        where id = $1 and published_at is null`,
      [row.id]
    )
    log("outbox.dispatched", { outboxId: row.id, queue: row.queue_name })
  } catch (error) {
    await pool.query(
      `update public.outbox_events
          set locked_at = null, locked_by = null, last_error = $2,
              available_at = timezone('utc'::text, now()) + ($3 * interval '1 second')
        where id = $1`,
      [
        row.id,
        error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
        Math.min(300, 2 ** Math.min(Number(row.attempts ?? 0), 8)),
      ]
    ).catch(() => {})
    throw error
  }
}

async function run() {
  await heartbeat()
  log("dispatcher.ready", { dispatcherId })
  while (!stopping) {
    try {
      if (Date.now() - lastHeartbeat >= 10_000) await heartbeat()
      const rows = await claimBatch()
      for (const row of rows) await dispatch(row)
      if (!rows.length) await new Promise((resolve) => setTimeout(resolve, 1_000))
    } catch (error) {
      logError("dispatcher.error", error)
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  }
}

function requestShutdown(signal) {
  if (stopping) return
  stopping = true
  log("dispatcher.shutdown", { signal })
}

process.once("SIGTERM", () => requestShutdown("SIGTERM"))
process.once("SIGINT", () => requestShutdown("SIGINT"))
await run()
await heartbeat("stopping").catch(() => {})
await Promise.all([...queues.values()].map((item) => item.close()))
await pool.end()
