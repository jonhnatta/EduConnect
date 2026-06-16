import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { dbPool } from "@/lib/db/pool"

export const runtime = "nodejs"

const schema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
})

type ResetCodeRow = {
  id: string
  code_hash: string
  expires_at: Date
  attempts: number
  max_attempts: number
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
    return NextResponse.json({ ok: false, error: "Codigo invalido" }, { status: 400 })
  }

  const email = parsed.data.email.toLowerCase().trim()
  const { code } = parsed.data
  const pool = dbPool()
  const client = await pool.connect()

  // Transacao + SELECT ... FOR UPDATE serializam tentativas concorrentes na mesma linha,
  // impedindo que N requisicoes paralelas leiam attempts=0 e furem o teto de tentativas.
  try {
    await client.query("begin")

    const codeRes = await client.query<ResetCodeRow>(
      `select prc.id, prc.code_hash, prc.expires_at, prc.attempts, prc.max_attempts
         from public.password_reset_codes prc
         join public.users u on u.id = prc.user_id
        where u.email = $1 and prc.used_at is null
        order by prc.created_at desc
        limit 1
        for update of prc`,
      [email],
    )
    const resetCode = codeRes.rows[0]

    if (!resetCode) {
      await client.query("rollback")
      return NextResponse.json({ ok: false, error: "Solicite um novo codigo" }, { status: 404 })
    }

    if (new Date(resetCode.expires_at).getTime() <= Date.now()) {
      await client.query("rollback")
      return NextResponse.json({ ok: false, error: "Codigo expirado. Solicite um novo envio" }, { status: 410 })
    }

    if (resetCode.attempts >= resetCode.max_attempts) {
      await client.query("rollback")
      return NextResponse.json({ ok: false, error: "Muitas tentativas. Solicite um novo codigo" }, { status: 429 })
    }

    const ok = await bcrypt.compare(code, resetCode.code_hash)
    if (!ok) {
      await client.query(
        "update public.password_reset_codes set attempts = attempts + 1 where id = $1",
        [resetCode.id],
      )
      await client.query("commit")
      return NextResponse.json({ ok: false, error: "Codigo incorreto" }, { status: 400 })
    }

    await client.query("commit")
    return NextResponse.json({ ok: true })
  } catch (error) {
    await client.query("rollback").catch(() => {})
    if (process.env.NODE_ENV !== "production") {
      console.error("/api/auth/password-reset/verify failed:", error)
    }
    return NextResponse.json({ ok: false, error: "Erro ao verificar codigo" }, { status: 500 })
  } finally {
    client.release()
  }
}
