import type { PoolClient } from "pg"
import type { OutboxEvent } from "@/lib/queue/contracts"

export async function addOutboxEvent(
  client: PoolClient,
  event: OutboxEvent
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.outbox_events
       (queue_name, event_type, schema_version, correlation_id, dedup_key,
        aggregate_type, aggregate_id, aggregate_version, payload, available_at)
     values ($1, $2, $3, coalesce($4, gen_random_uuid()), $5, $6, $7, $8, $9::jsonb,
             coalesce($10, timezone('utc'::text, now())))
     on conflict (queue_name, dedup_key) where dedup_key is not null
       do update set queue_name = excluded.queue_name
     returning id`,
    [
      event.queueName,
      event.eventType,
      event.schemaVersion ?? 1,
      event.correlationId ?? null,
      event.dedupKey ?? null,
      event.aggregateType ?? null,
      event.aggregateId ?? null,
      event.aggregateVersion ?? null,
      JSON.stringify(event.payload),
      event.availableAt?.toISOString() ?? null,
    ]
  )
  return result.rows[0]!.id
}
