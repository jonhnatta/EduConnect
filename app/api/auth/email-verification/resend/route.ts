import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { createResetCode, fingerprintResetEmail } from "@/lib/auth/password-reset"
import { dbPool } from "@/lib/db/pool"
import { queueEmailDelivery } from "@/lib/email/delivery"
import { checkRateLimit } from "@/lib/security/rate-limit"

export const runtime = "nodejs"

const schema = z.object({ email: z.string().email() })

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: true })

  const email = parsed.data.email.toLowerCase().trim()
  const allowed = await checkRateLimit(`email-verify:${fingerprintResetEmail(email)}`, 5, 3600, { failClosed: true })
  if (!allowed) return NextResponse.json({ ok: true })

  const client = await dbPool().connect()
  try {
    await client.query("begin")
    const user = await client.query<{ id: string; email_verified_at: string | null }>(
      "select id, email_verified_at from public.users where email = $1 for update",
      [email]
    )
    const row = user.rows[0]
    if (!row || row.email_verified_at) {
      await client.query("commit")
      return NextResponse.json({ ok: true })
    }

    await client.query(
      "update public.email_verification_codes set used_at = timezone('utc'::text, now()) where user_id = $1 and used_at is null",
      [row.id]
    )
    const code = createResetCode()
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    const verification = await client.query<{ id: string }>(
      `insert into public.email_verification_codes (user_id, code_hash, expires_at)
       values ($1, $2, $3) returning id`,
      [row.id, await bcrypt.hash(code, 12), expiresAt.toISOString()]
    )
    await queueEmailDelivery(client, {
      recipient: email,
      template: "email_verification",
      code,
      expiresAt,
      dedupKey: `email-verification:${verification.rows[0]!.id}`,
    })
    await client.query("commit")
    return NextResponse.json({ ok: true })
  } catch (error) {
    await client.query("rollback").catch(() => {})
    if (process.env.NODE_ENV !== "production") console.error("email verification resend failed", error)
    return NextResponse.json({ ok: true })
  } finally {
    client.release()
  }
}
