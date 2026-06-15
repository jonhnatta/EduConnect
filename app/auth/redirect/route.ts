import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { profileRedirectPath, safeInternalPath } from "@/lib/auth/redirect"
import { queryOne } from "@/lib/db/query"

export const runtime = "nodejs"

type ProfileRow = {
  user_type: string | null
  professor_verification_status: string | null
}

// Usa NEXT_PUBLIC_APP_URL para evitar que request.url contenha 0.0.0.0
// (endereço de bind do servidor) na URL de redirecionamento enviada ao browser.
function appOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // ignora URL mal-formada, cai no fallback
    }
  }
  return new URL(requestUrl).origin
}

export async function GET(request: NextRequest) {
  const base = appOrigin(request.url)
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined

  if (!userId) {
    return NextResponse.redirect(new URL("/login", base))
  }

  const profile = await queryOne<ProfileRow>(
    "select user_type, professor_verification_status from public.profiles where id = $1",
    [userId],
  )

  if (!profile?.user_type) {
    return NextResponse.redirect(new URL("/cadastro/tipo-conta", base))
  }

  const destination = profileRedirectPath(profile)
  const next =
    destination === "/dashboard/aluno" || destination === "/dashboard/professor"
      ? safeInternalPath(request.nextUrl.searchParams.get("next"))
      : null

  return NextResponse.redirect(new URL(next ?? destination, base))
}
