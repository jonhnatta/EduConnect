import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import {
  PASSWORD_RESET_CODE_TTL_HOURS,
  PASSWORD_RESET_DAILY_LIMIT,
  createResetCode,
  fingerprintResetEmail,
  normalizeResetEmail,
  resolveResetRequestAction,
  type RequestLimitRow,
} from "@/lib/auth/password-reset"
import { dbPool } from "@/lib/db/pool"
import { queueEmailDelivery } from "@/lib/email/delivery"

export const runtime = "nodejs"

const schema = z.object({
  email: z.string().email(),
})

type UserRow = {
  id: string
  email: string
}

function genericSuccess() {
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo invalido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Informe um e-mail valido" }, { status: 400 })
  }

  const email = normalizeResetEmail(parsed.data.email)
  const emailFingerprint = fingerprintResetEmail(email)
  const pool = dbPool()

  const client = await pool.connect()
  let user: UserRow | undefined
  let code = ""
  try {
    await client.query("begin")

    const limitRes = await client.query<RequestLimitRow>(
      `select last_requested_at, window_started_at, request_count
         from public.password_reset_request_limits
        where email_fingerprint = $1
        for update`,
      [emailFingerprint],
    )
    const limit = limitRes.rows[0] ?? null

    const actionBeforeUserLookup = resolveResetRequestAction({
      limit,
      userExists: true,
    })

    if (actionBeforeUserLookup === "acknowledge_only") {
      await client.query("commit")
      return genericSuccess()
    }

    await client.query(
      `insert into public.password_reset_request_limits
        (email_fingerprint, last_requested_at, window_started_at, request_count, updated_at)
       values ($1, timezone('utc'::text, now()), timezone('utc'::text, now()), 1, timezone('utc'::text, now()))
       on conflict (email_fingerprint) do update set
         last_requested_at = excluded.last_requested_at,
         updated_at = excluded.updated_at,
         window_started_at = case
           when public.password_reset_request_limits.window_started_at <= timezone('utc'::text, now()) - interval '24 hours'
             then excluded.window_started_at
           else public.password_reset_request_limits.window_started_at
         end,
         request_count = case
           when public.password_reset_request_limits.window_started_at <= timezone('utc'::text, now()) - interval '24 hours'
             then 1
           else least(public.password_reset_request_limits.request_count + 1, $2)
         end`,
      [emailFingerprint, PASSWORD_RESET_DAILY_LIMIT],
    )

    const userRes = await client.query<UserRow>(
      "select id, email from public.users where email = $1",
      [email],
    )
    user = userRes.rows[0]

    const action = resolveResetRequestAction({
      limit,
      userExists: Boolean(user),
    })

    if (action === "acknowledge_only") {
      await client.query("commit")
      return genericSuccess()
    }

    code = createResetCode()
    const codeHash = await bcrypt.hash(code, 12)

    await client.query(
      "update public.password_reset_codes set used_at = timezone('utc'::text, now()) where user_id = $1 and used_at is null",
      [user.id],
    )
    const resetCode = await client.query<{ id: string }>(
      `insert into public.password_reset_codes (user_id, code_hash, expires_at)
       values ($1, $2, timezone('utc'::text, now()) + ($3::text || ' hours')::interval)
       returning id`,
      [user.id, codeHash, PASSWORD_RESET_CODE_TTL_HOURS],
    )
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_CODE_TTL_HOURS * 60 * 60 * 1000)
    await queueEmailDelivery(client, {
      recipient: user.email,
      template: "password_reset",
      code,
      expiresAt,
      dedupKey: `password-reset:${resetCode.rows[0]!.id}`,
    })
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    if (process.env.NODE_ENV !== "production") {
      console.error("/api/auth/password-reset/request failed:", error)
    }
    return NextResponse.json({ ok: false, error: "Erro ao gerar codigo" }, { status: 500 })
  } finally {
    client.release()
  }

  return genericSuccess()
}
