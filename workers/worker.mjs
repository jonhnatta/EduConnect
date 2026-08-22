import { Worker } from "bullmq"
import { createDecipheriv, randomUUID } from "node:crypto"
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import pg from "pg"
import { log, logError, redisConnection } from "./runtime.mjs"

const databaseUrl = process.env.DATABASE_URL
const redisUrl = process.env.REDIS_QUEUE_URL
const namespace = process.env.REDIS_NAMESPACE
if (!databaseUrl) throw new Error("Missing env var: DATABASE_URL")
if (!redisUrl) throw new Error("Missing env var: REDIS_QUEUE_URL")
if (!namespace) throw new Error("Missing env var: REDIS_NAMESPACE")

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
  max: 4,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 15_000,
  query_timeout: 20_000,
  lock_timeout: 5_000,
  idle_in_transaction_session_timeout: 30_000,
  application_name: "educonnect-worker",
})
pool.on("error", (error) => logError("database.pool.error", error))
const workerInstanceId = process.env.HOSTNAME || randomUUID()
const storageBucket = process.env.S3_BUCKET
const storage = storageBucket
  ? new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
      },
    })
  : null

async function heartbeat(status = "ready") {
  await pool.query(
    `insert into public.service_heartbeats
       (service_name, instance_id, status, metadata, heartbeat_at)
     values ('worker', $1, $2, $3::jsonb, timezone('utc'::text, now()))
     on conflict (service_name) do update set
       instance_id = excluded.instance_id, status = excluded.status,
       metadata = excluded.metadata, heartbeat_at = excluded.heartbeat_at`,
    [workerInstanceId, status, JSON.stringify({ queues: ["notification.fanout", "email.send", "account.purge"] })]
  )
}

async function idempotent(job, handler) {
  const jobKey = `${job.queueName}:${job.id}`
  const claimed = await pool.query(
    `insert into public.job_executions
       (job_key, queue_name, status, locked_until)
     values ($1, $2, 'processing', timezone('utc'::text, now()) + interval '5 minutes')
     on conflict (job_key) do update set
       status = 'processing', attempts = public.job_executions.attempts + 1,
       locked_until = timezone('utc'::text, now()) + interval '5 minutes',
       updated_at = timezone('utc'::text, now()), last_error = null
     where public.job_executions.status <> 'completed'
       and (public.job_executions.locked_until is null
            or public.job_executions.locked_until < timezone('utc'::text, now()))
     returning job_key`,
    [jobKey, job.queueName]
  )
  if (!claimed.rowCount) {
    const state = await pool.query("select status from public.job_executions where job_key = $1", [jobKey])
    if (state.rows[0]?.status === "completed") return
    throw new Error(`Job ${jobKey} is already leased`)
  }

  try {
    await handler(job)
    await pool.query(
      `update public.job_executions
          set status = 'completed', completed_at = timezone('utc'::text, now()),
              locked_until = null, updated_at = timezone('utc'::text, now())
        where job_key = $1`,
      [jobKey]
    )
  } catch (error) {
    await pool.query(
      `update public.job_executions
          set status = 'failed', locked_until = null, last_error = $2,
              updated_at = timezone('utc'::text, now())
        where job_key = $1`,
      [jobKey, error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000)]
    ).catch(() => {})
    throw error
  }
}

async function fanoutNewContent(job) {
  const data = job.data
  const { teacherId, teacherName, entityId, contentTypeLabel, title } = data
  if (![teacherId, teacherName, entityId, contentTypeLabel, title].every((value) => typeof value === "string" && value)) {
    throw new Error("Invalid notification.fanout payload")
  }
  const eventId = data.meta?.eventId
  const domainEventId = data.domainEventId ?? eventId
  const cursor = typeof data.cursor === "string" ? data.cursor : null
  if (typeof eventId !== "string" || typeof domainEventId !== "string") {
    throw new Error("Missing notification.fanout event metadata")
  }
  const batchSize = Math.min(
    500,
    Math.max(10, Number(process.env.WORKER_NOTIFICATION_BATCH_SIZE ?? "200"))
  )
  const message = `${teacherName} publicou um novo ${contentTypeLabel}: "${title}"`.slice(0, 500)
  const client = await pool.connect()
  try {
    await client.query("begin")
    const recipients = await client.query(
      `select tf.student_id,
              (p.notification_prefs->>'new_content') is distinct from 'false' as enabled
         from public.teacher_followers tf
         join public.profiles p on p.id = tf.student_id
        where tf.teacher_id = $1
          and p.deleted_at is null
          and p.account_status = 'active'
          and public.user_can_view_content_item($4::uuid, tf.student_id)
          and ($2::uuid is null or tf.student_id > $2::uuid)
        order by tf.student_id
        limit $3`,
      [teacherId, cursor, batchSize, entityId]
    )
    const enabledIds = recipients.rows.filter((row) => row.enabled).map((row) => row.student_id)
    if (enabledIds.length) {
      await client.query(
        `insert into public.notifications
           (recipient_id, type, actor_id, entity_id, event_id, entity_type, message)
         select recipient_id, 'new_content', $1, $2, $2, 'content_item', $3
           from unnest($4::uuid[]) as recipients(recipient_id)
         on conflict (recipient_id, type, event_id) where event_id is not null do nothing`,
        [teacherId, entityId, message, enabledIds]
      )
    }

    if (recipients.rowCount === batchSize) {
      const nextCursor = recipients.rows.at(-1).student_id
      await client.query(
        `insert into public.outbox_events
           (queue_name, event_type, schema_version, correlation_id, dedup_key,
            aggregate_type, aggregate_id, payload)
         values ('notification.fanout', 'content.published', 1, $1, $2,
                 'content_item', $3, $4::jsonb)
         on conflict (queue_name, dedup_key) where dedup_key is not null do nothing`,
        [
          data.meta.correlationId,
          `notification-fanout:${domainEventId}:${nextCursor}`,
          entityId,
          JSON.stringify({
            teacherId,
            teacherName,
            entityId,
            contentTypeLabel,
            title,
            domainEventId,
            cursor: nextCursor,
          }),
        ]
      )
    }
    await client.query("commit")
    log("notification.fanout.batch", {
      eventId,
      recipients: recipients.rowCount,
      delivered: enabledIds.length,
      continued: recipients.rowCount === batchSize,
    })
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function decryptEmailPayload(value) {
  const encodedKey = process.env.EMAIL_PAYLOAD_ENCRYPTION_KEY
  if (!encodedKey) throw new Error("Missing env var: EMAIL_PAYLOAD_ENCRYPTION_KEY")
  const key = Buffer.from(encodedKey, "base64")
  if (key.length !== 32) throw new Error("EMAIL_PAYLOAD_ENCRYPTION_KEY must decode to 32 bytes")
  const [version, ivValue, tagValue, ciphertextValue] = String(value).split(".")
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted email payload")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString("utf8"))
}

function emailContent(template, code) {
  if (template === "email_verification") {
    return {
      subject: "Confirme seu e-mail - EduConnect",
      text: `Seu codigo de confirmacao e: ${code}\n\nEle expira em 30 minutos.`,
      title: "Confirme seu e-mail",
      description: "Use o codigo abaixo para ativar sua conta.",
    }
  }
  if (template === "password_reset") {
    return {
      subject: "Codigo de recuperacao de senha - EduConnect",
      text: `Seu codigo de recuperacao e: ${code}\n\nEle expira em 24 horas e pode ser usado apenas uma vez.`,
      title: "Recuperacao de senha",
      description: "Use o codigo abaixo para redefinir sua senha.",
    }
  }
  throw new Error(`Unsupported email template: ${template}`)
}

async function sendEmail(job) {
  const deliveryId = job.data?.deliveryId
  if (typeof deliveryId !== "string") throw new Error("Missing email deliveryId")
  const result = await pool.query(
    `select id, recipient_email, template, payload_encrypted, status, expires_at
       from public.email_deliveries where id = $1`,
    [deliveryId]
  )
  const delivery = result.rows[0]
  if (!delivery) throw new Error("Email delivery not found")
  if (delivery.status === "sent") return
  if (new Date(delivery.expires_at).getTime() <= Date.now()) {
    throw new Error("Email delivery expired")
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || process.env.PASSWORD_RESET_FROM_EMAIL
  if (!apiKey) throw new Error("Missing env var: RESEND_API_KEY")
  if (!from) throw new Error("Missing env var: EMAIL_FROM")
  const payload = decryptEmailPayload(delivery.payload_encrypted)
  if (typeof payload.code !== "string") throw new Error("Invalid email payload")
  const content = emailContent(delivery.template, payload.code)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": deliveryId,
      },
      body: JSON.stringify({
        from,
        to: delivery.recipient_email,
        subject: content.subject,
        text: content.text,
        html: `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5"><h1>${content.title}</h1><p>${content.description}</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1D4ED8;margin:24px 0">${payload.code}</div><p>Se voce nao solicitou esta mensagem, ignore este e-mail.</p></div>`,
      }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`Resend status ${response.status}: ${detail.slice(0, 200)}`)
    }
    const provider = await response.json().catch(() => ({}))
    await pool.query(
      `update public.email_deliveries
          set status = 'sent', attempts = attempts + 1, sent_at = timezone('utc'::text, now()),
              provider_message_id = $2, last_error = null
        where id = $1`,
      [deliveryId, typeof provider.id === "string" ? provider.id : null]
    )
  } catch (error) {
    await pool.query(
      `update public.email_deliveries
          set status = 'failed', attempts = attempts + 1, last_error = $2
        where id = $1`,
      [deliveryId, error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000)]
    ).catch(() => {})
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function collectObjectRefs(value, output) {
  if (typeof value === "string") {
    const key = value.replace(/^\/+/, "")
    if (/^(profiles|professor-verification|articles|classroom-activities|classroom-materials|classroom-mural)\//.test(key)) {
      output.add(key)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectObjectRefs(item, output)
    return
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectObjectRefs(item, output)
  }
}

async function listPrefix(prefix) {
  if (!storage || !storageBucket) throw new Error("S3 is not configured in worker")
  const keys = []
  let continuationToken
  do {
    const page = await storage.send(new ListObjectsV2Command({
      Bucket: storageBucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const item of page.Contents ?? []) if (item.Key) keys.push(item.Key)
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return keys
}

async function deleteObjectKeys(keys) {
  if (!storage || !storageBucket) throw new Error("S3 is not configured in worker")
  const values = [...new Set(keys)]
  for (let offset = 0; offset < values.length; offset += 1_000) {
    const batch = values.slice(offset, offset + 1_000)
    if (!batch.length) continue
    const result = await storage.send(new DeleteObjectsCommand({
      Bucket: storageBucket,
      Delete: { Quiet: true, Objects: batch.map((Key) => ({ Key })) },
    }))
    if (result.Errors?.length) throw new Error(`Failed to delete ${result.Errors.length} stored objects`)
  }
}

async function purgeAccount(job) {
  const userId = job.data?.userId
  if (typeof userId !== "string") throw new Error("Missing account purge userId")
  const profile = await pool.query(
    `select p.avatar_url, p.cover_url, p.professor_verification_doc_url, p.deleted_at
       from public.profiles p where p.id = $1`,
    [userId]
  )
  if (!profile.rows[0]) return
  const deletedAt = new Date(profile.rows[0].deleted_at).getTime()
  if (!Number.isFinite(deletedAt) || deletedAt > Date.now() - 30 * 24 * 60 * 60 * 1000) {
    throw new Error("Account retention period has not expired")
  }

  const [content, classrooms, submissions] = await Promise.all([
    pool.query("select id, settings from public.content_items where author_id = $1", [userId]),
    pool.query("select id, cover_image_pathname from public.classrooms where professor_id = $1", [userId]),
    pool.query(
      "select submission_attachments from public.classroom_activity_submissions where student_id = $1",
      [userId]
    ),
  ])
  const keys = new Set()
  collectObjectRefs(profile.rows[0], keys)
  collectObjectRefs(content.rows, keys)
  collectObjectRefs(submissions.rows, keys)
  const prefixes = [`profiles/${userId}/`, `professor-verification/${userId}/`]
  for (const item of content.rows) prefixes.push(`articles/${item.id}/`)
  for (const classroom of classrooms.rows) {
    collectObjectRefs(classroom, keys)
    prefixes.push(`classroom-activities/${classroom.id}/`)
    prefixes.push(`classroom-materials/${classroom.id}/`)
    prefixes.push(`classroom-mural/${classroom.id}/`)
  }
  for (const prefix of prefixes) {
    for (const key of await listPrefix(prefix)) keys.add(key)
  }
  await deleteObjectKeys([...keys])

  const client = await pool.connect()
  try {
    await client.query("begin")
    const deleted = await client.query(
      `delete from public.users u
        using public.profiles p
        where u.id = $1 and p.id = u.id
          and p.deleted_at < timezone('utc'::text, now()) - interval '30 days'
        returning u.id`,
      [userId]
    )
    if (!deleted.rowCount) throw new Error("Account purge state changed")
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
  log("account.purged", { userId, deletedObjects: keys.size })
}

const workers = [
  new Worker(
    "notification.fanout",
    (job) => idempotent(job, fanoutNewContent),
    {
      connection: redisConnection(redisUrl),
      prefix: namespace,
      concurrency: Number(process.env.WORKER_NOTIFICATION_CONCURRENCY ?? "4"),
    }
  ),
  new Worker(
    "email.send",
    (job) => idempotent(job, sendEmail),
    {
      connection: redisConnection(redisUrl),
      prefix: namespace,
      concurrency: Number(process.env.WORKER_EMAIL_CONCURRENCY ?? "4"),
    }
  ),
  new Worker(
    "account.purge",
    (job) => idempotent(job, purgeAccount),
    {
      connection: redisConnection(redisUrl),
      prefix: namespace,
      concurrency: Number(process.env.WORKER_PURGE_CONCURRENCY ?? "1"),
    }
  ),
]

for (const worker of workers) {
  worker.on("ready", () => log("worker.ready", { queue: worker.name }))
  worker.on("completed", (job) => log("job.completed", { queue: worker.name, jobId: job.id }))
  worker.on("failed", (job, error) => {
    logError("job.failed", error, { queue: worker.name, jobId: job?.id })
    if (!job || job.attemptsMade < Number(job.opts.attempts ?? 1)) return
    const jobKey = `${job.queueName}:${job.id}`
    void pool.query(
      `insert into public.job_dead_letters
         (job_key, queue_name, job_name, event_id, attempts, last_error)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (job_key) do update set
         attempts = excluded.attempts, last_error = excluded.last_error,
         failed_at = timezone('utc'::text, now()), replayed_at = null`,
      [
        jobKey,
        job.queueName,
        job.name,
        job.data?.meta?.eventId ?? null,
        job.attemptsMade,
        error.message.slice(0, 1_000),
      ]
    ).catch((dlqError) => logError("job.dlq_write_failed", dlqError, { jobKey }))
  })
  worker.on("error", (error) => logError("worker.error", error, { queue: worker.name }))
}

await heartbeat()
const heartbeatTimer = setInterval(() => {
  void heartbeat().catch((error) => logError("worker.heartbeat.failed", error))
}, 10_000)

async function shutdown(signal) {
  log("worker.shutdown", { signal })
  clearInterval(heartbeatTimer)
  await heartbeat("stopping").catch(() => {})
  await Promise.all(workers.map((worker) => worker.close()))
  await pool.end()
  process.exit(0)
}

process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))
