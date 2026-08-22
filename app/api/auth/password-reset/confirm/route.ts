import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { dbPool } from "@/lib/db/pool"

export const runtime = "nodejs"

const schema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(72),
  confirmPassword: z.string().min(8).max(72),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas nao coincidem",
  path: ["confirmPassword"],
})

type ResetCodeRow = {
  id: string
  user_id: string
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
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      { ok: false, error: issue?.message || "Dados invalidos" },
      { status: 400 },
    )
  }

  const email = parsed.data.email.toLowerCase().trim()
  const { code, password } = parsed.data
  const pool = dbPool()
  const client = await pool.connect()

  try {
    await client.query("begin")

    const codeRes = await client.query<ResetCodeRow>(
      `select prc.id, prc.user_id, prc.code_hash, prc.expires_at, prc.attempts, prc.max_attempts
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

    const codeOk = await bcrypt.compare(code, resetCode.code_hash)
    if (!codeOk) {
      await client.query(
        "update public.password_reset_codes set attempts = attempts + 1 where id = $1",
        [resetCode.id],
      )
      await client.query("commit")
      return NextResponse.json({ ok: false, error: "Codigo incorreto" }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await client.query(
      "update public.users set password_hash = $1, session_version = session_version + 1 where id = $2",
      [passwordHash, resetCode.user_id],
    )
    await client.query(
      "update public.password_reset_codes set used_at = timezone('utc'::text, now()) where id = $1",
      [resetCode.id],
    )
    await client.query(
      "update public.password_reset_codes set used_at = timezone('utc'::text, now()) where user_id = $1 and used_at is null",
      [resetCode.user_id],
    )
    await client.query("commit")

    return NextResponse.json({ ok: true })
  } catch (error) {
    await client.query("rollback").catch(() => {})
    if (process.env.NODE_ENV !== "production") {
      console.error("/api/auth/password-reset/confirm failed:", error)
    }
    return NextResponse.json({ ok: false, error: "Erro ao alterar senha" }, { status: 500 })
  } finally {
    client.release()
  }
}
