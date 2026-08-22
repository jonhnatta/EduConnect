"use server"

import { Queue } from "bullmq"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getAdminMfaAccess } from "@/lib/auth/admin"
import { withTransaction } from "@/lib/db/transaction"
import { bullmqConnection } from "@/lib/queue/redis-connection"

const schema = z.object({ deadLetterId: z.string().uuid() })

export async function replayDeadLetter(formData: FormData): Promise<void> {
  const admin = await getAdminMfaAccess()
  if (!admin) redirect("/admin/mfa")
  if (admin.role !== "admin") redirect("/admin/filas?error=forbidden")
  const parsed = schema.safeParse({ deadLetterId: formData.get("deadLetterId") })
  if (!parsed.success) redirect("/admin/filas?error=invalid")
  const redisUrl = process.env.REDIS_QUEUE_URL
  const namespace = process.env.REDIS_NAMESPACE
  if (!redisUrl || !namespace) redirect("/admin/filas?error=config")

  let queue: Queue | null = null
  try {
    const replay = await withTransaction(async (client) => {
      const result = await client.query<{
        id: string
        event_id: string | null
        queue_name: string
        job_key: string
        replayed_at: string | null
      }>(
        `select id, event_id, queue_name, job_key, replayed_at
           from public.job_dead_letters where id = $1 for update`,
        [parsed.data.deadLetterId]
      )
      const row = result.rows[0]
      if (!row || row.replayed_at || !row.event_id) throw new Error("DLQ item is not replayable")
      return row
    })

    queue = new Queue(replay.queue_name, {
      connection: bullmqConnection(redisUrl),
      prefix: namespace,
    })
    const previousJob = await queue.getJob(replay.event_id!)
    if (previousJob) await previousJob.remove()

    await withTransaction(async (client) => {
      const updated = await client.query(
        `update public.job_dead_letters
            set replayed_at = timezone('utc'::text, now())
          where id = $1 and replayed_at is null`,
        [replay.id]
      )
      if (!updated.rowCount) throw new Error("DLQ item already replayed")
      await client.query("delete from public.job_executions where job_key = $1", [replay.job_key])
      await client.query(
        `update public.outbox_events
            set published_at = null, locked_at = null, locked_by = null,
                attempts = 0, available_at = timezone('utc'::text, now()), last_error = null
          where id = $1`,
        [replay.event_id]
      )
      await client.query(
        `insert into public.admin_audit_events
           (admin_user_id, action, target_type, target_id, metadata)
         values ($1, 'queue.dlq.replayed', 'job_dead_letter', $2,
                 jsonb_build_object('queue', $3, 'eventId', $4))`,
        [admin.userId, replay.id, replay.queue_name, replay.event_id]
      )
    })
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin.queue.replay_failed",
      adminUserId: admin.userId,
      message: error instanceof Error ? error.message : String(error),
    }))
    redirect("/admin/filas?error=replay")
  } finally {
    await queue?.close().catch(() => {})
  }
  revalidatePath("/admin/filas")
  redirect("/admin/filas?success=1")
}
