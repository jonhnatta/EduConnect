import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { dbPool } from "@/lib/db/pool"
import { checkRateLimit } from "@/lib/security/rate-limit"

export const runtime = "nodejs"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(200),
  userType: z.enum(["aluno", "professor"]),
  interests: z.array(z.string().max(60)).max(20).optional().default([]),
  // Aceite obrigatório de Termos + Privacidade (consentimento LGPD registrado no servidor).
  acceptedTerms: z.literal(true),
})

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return request.headers.get("x-real-ip") ?? "unknown"
}

export async function POST(request: Request) {
  // Rate limit por IP: freia criação em massa e enumeração via tentativa repetida.
  const ip = clientIp(request)
  const allowed = await checkRateLimit(`signup:${ip}`, 10, 3600)
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo invalido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dados invalidos" }, { status: 400 })
  }

  const { email, password, fullName, userType, interests } = parsed.data
  const normalizedEmail = email.toLowerCase().trim()
  const passwordHash = await bcrypt.hash(password, 12)

  const pool = dbPool()
  const client = await pool.connect()
  try {
    await client.query("begin")

    const userRes = await client.query<{ id: string }>(
      "insert into public.users (email, password_hash) values ($1, $2) returning id",
      [normalizedEmail, passwordHash]
    )
    const userId = userRes.rows[0]?.id
    if (!userId) throw new Error("Falha ao criar usuario")

    // Professor nasce com perfil PÚBLICO (para ser descoberto no Explorar); aluno fica privado.
    await client.query(
      "insert into public.profiles (id, full_name, user_type, interests, profile_visibility, terms_accepted_at) values ($1, $2, $3, $4, $5, timezone('utc'::text, now()))",
      [userId, fullName, userType, interests, userType === "professor" ? "public" : "private"]
    )

    await client.query("commit")
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    await client.query("rollback").catch(() => {})
    const msg = String(e?.message || "")

    // Helpful diagnostics during development; avoid leaking internals in production.
    if (process.env.NODE_ENV !== "production") {
      console.error("/api/auth/signup failed:", e)
    }

    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Este e-mail ja esta cadastrado" }, { status: 409 })
    }

    // Common local setup issues.
    if (msg.toLowerCase().includes("connect") || msg.toLowerCase().includes("econn") || msg.toLowerCase().includes("timeout")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falha ao conectar no banco de dados",
          detail: process.env.NODE_ENV !== "production" ? msg : undefined,
        },
        { status: 500 }
      )
    }
    if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Banco de dados nao inicializado (tabelas ausentes)",
          detail: process.env.NODE_ENV !== "production" ? msg : undefined,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: false, error: "Erro ao criar conta" }, { status: 500 })
  } finally {
    client.release()
  }
}
