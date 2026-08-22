import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { dashboardPathForUserType } from "@/lib/auth/redirect"
import { upsertProfile } from "@/lib/auth/profile"
import { dbPool } from "@/lib/db/pool"
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/config/legal"

export const runtime = "nodejs"

const schema = z.object({
  userType: z.enum(["aluno", "professor"]),
  // Aceite de Termos + Privacidade no onboarding (inclui usuários via login social).
  acceptedTerms: z.literal(true),
})

export async function POST(request: Request) {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo invalido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Tipo de conta invalido" }, { status: 400 })
  }

  const client = await dbPool().connect()
  try {
    // Selecao de tipo de conta e unica: permite NULL -> {aluno|professor}, mas impede
    // alternar o papel depois (defeito de regra: o guard so existia na pagina).
    const current = await client.query<{ user_type: string | null }>(
      "select user_type from public.profiles where id = $1",
      [userId],
    )
    const existing = current.rows[0]?.user_type ?? null
    if (existing && existing !== parsed.data.userType) {
      return NextResponse.json(
        { ok: false, error: "Tipo de conta ja definido e nao pode ser alterado" },
        { status: 409 },
      )
    }

    await upsertProfile(client, {
      id: userId,
      userType: parsed.data.userType,
    })
    // Registra o consentimento (LGPD) sem sobrescrever um aceite anterior.
    await client.query(
      `update public.profiles
          set terms_accepted_at = coalesce(terms_accepted_at, timezone('utc'::text, now())),
              terms_accepted_version = $2,
              privacy_accepted_version = $3
        where id = $1`,
      [userId, TERMS_VERSION, PRIVACY_VERSION],
    )
    // Professor nasce com perfil PÚBLICO (descoberta no Explorar); só ajusta a partir do padrão.
    if (parsed.data.userType === "professor") {
      await client.query(
        "update public.profiles set profile_visibility = 'public' where id = $1 and profile_visibility = 'private'",
        [userId],
      )
    }
  } finally {
    client.release()
  }

  return NextResponse.json({
    ok: true,
    redirectTo: dashboardPathForUserType(parsed.data.userType),
  })
}
