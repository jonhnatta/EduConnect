import { NextResponse } from "next/server"
import { withTransaction } from "@/lib/db/transaction"
import { addOutboxEvent } from "@/lib/queue/outbox"

/**
 * LGPD Art. 18 — Hard-delete de contas marcadas há mais de 30 dias.
 * Chamar via cron job (ex.: Vercel Cron ou pg_cron).
 * Protegido por CRON_SECRET no header x-cron-secret.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const queued = await withTransaction(async (client) => {
    const rows = await client.query<{ id: string }>(
      `select id from public.profiles
        where deleted_at is not null
          and deleted_at < timezone('utc'::text, now()) - interval '30 days'
        order by deleted_at
        for update skip locked
        limit 100`
    )
    for (const row of rows.rows) {
      await addOutboxEvent(client, {
        queueName: "account.purge",
        eventType: "account.retention_expired",
        dedupKey: `account-purge:${row.id}`,
        aggregateType: "profile",
        aggregateId: row.id,
        payload: { userId: row.id },
      })
    }
    return rows.rowCount
  })

  console.info(JSON.stringify({ event: "account.purge.queued", count: queued }))
  return NextResponse.json({ queued })
}
