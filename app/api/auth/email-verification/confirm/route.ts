import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { dbPool } from "@/lib/db/pool"

export const runtime = "nodejs"

const schema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Codigo invalido" }, { status: 400 })
  }

  const email = parsed.data.email.toLowerCase().trim()
  const client = await dbPool().connect()
  try {
    await client.query("begin")
    const result = await client.query<{
      id: string
      user_id: string
      code_hash: string
      expires_at: string
      attempts: number
      max_attempts: number
      email_verified_at: string | null
    }>(
      `select ev.id, ev.user_id, ev.code_hash, ev.expires_at, ev.attempts,
              ev.max_attempts, u.email_verified_at
         from public.email_verification_codes ev
         join public.users u on u.id = ev.user_id
        where u.email = $1 and ev.used_at is null
        order by ev.created_at desc
        limit 1
        for update of ev`,
      [email]
    )
    const row = result.rows[0]
    if (row?.email_verified_at) {
      await client.query("commit")
      return NextResponse.json({ ok: true })
    }
    if (
      !row ||
      row.attempts >= row.max_attempts ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      await client.query("rollback")
      return NextResponse.json({ ok: false, error: "Codigo invalido ou expirado" }, { status: 400 })
    }

    const matches = await bcrypt.compare(parsed.data.code, row.code_hash)
    if (!matches) {
      await client.query(
        "update public.email_verification_codes set attempts = attempts + 1 where id = $1",
        [row.id]
      )
      await client.query("commit")
      return NextResponse.json({ ok: false, error: "Codigo invalido ou expirado" }, { status: 400 })
    }

    await client.query(
      "update public.email_verification_codes set used_at = timezone('utc'::text, now()) where user_id = $1 and used_at is null",
      [row.user_id]
    )
    await client.query(
      `update public.users
          set email_verified_at = coalesce(email_verified_at, timezone('utc'::text, now())),
              session_version = session_version + 1
        where id = $1`,
      [row.user_id]
    )
    await client.query("commit")
    return NextResponse.json({ ok: true })
  } catch (error) {
    await client.query("rollback").catch(() => {})
    if (process.env.NODE_ENV !== "production") {
      console.error("email verification confirm failed", error)
    }
    return NextResponse.json({ ok: false, error: "Falha ao confirmar e-mail" }, { status: 500 })
  } finally {
    client.release()
  }
}
