import type { PoolClient } from "pg"
import { addOutboxEvent } from "@/lib/queue/outbox"
import { encryptEmailPayload } from "@/lib/email/encryption"

type EmailTemplate = "email_verification" | "password_reset"

export async function queueEmailDelivery(
  client: PoolClient,
  input: {
    recipient: string
    template: EmailTemplate
    code: string
    expiresAt: Date
    dedupKey: string
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.email_deliveries
       (recipient_email, template, payload_encrypted, expires_at)
     values ($1, $2, $3, $4)
     returning id`,
    [
      input.recipient.toLowerCase().trim(),
      input.template,
      encryptEmailPayload({ code: input.code }),
      input.expiresAt.toISOString(),
    ]
  )
  const deliveryId = result.rows[0]!.id
  await addOutboxEvent(client, {
    queueName: "email.send",
    eventType: input.template,
    dedupKey: input.dedupKey,
    aggregateType: "email_delivery",
    aggregateId: deliveryId,
    payload: { deliveryId },
  })
  return deliveryId
}
