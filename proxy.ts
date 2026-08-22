import { auth } from "@/auth"
import { NextResponse, type NextRequest } from "next/server"
import { canonicalAuthPageUrl } from "@/lib/auth/redirect"

function homeFor(userType?: string | null): string {
  if (userType === "professor") return "/dashboard/professor"
  if (userType === "aluno") return "/dashboard/aluno"
  return "/cadastro/tipo-conta"
}

function publicRequestUrl(request: NextRequest): string {
  try {
    const url = new URL(request.url)
    const forwardedHost =
      process.env.TRUST_PROXY_HEADERS === "true"
        ? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
        : null
    const host = forwardedHost || request.headers.get("host")
    if (host) url.host = host

    if (process.env.TRUST_PROXY_HEADERS === "true") {
      const protocol = request.headers
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim()
      if (protocol === "http" || protocol === "https") {
        url.protocol = `${protocol}:`
      }
    }

    return url.toString()
  } catch {
    return request.url
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (request.method === "GET" && pathname === "/login") {
    const canonicalUrl = canonicalAuthPageUrl(
      publicRequestUrl(request),
      process.env.AUTH_URL ??
        process.env.NEXTAUTH_URL ??
        process.env.NEXT_PUBLIC_APP_URL,
    )
    if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 307)
  }

  const session = await auth()
  const userType = (session?.user as any)?.userType as "aluno" | "professor" | null | undefined

  const isDashboard = pathname.startsWith("/dashboard")
  const isAuthPage = pathname === "/login" || pathname === "/cadastro"

  // Nao autenticado tentando acessar o dashboard -> login
  if (isDashboard && !session?.user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // Autenticado sem tipo definido nao deve entrar em dashboard nenhum.
  if (isDashboard && session?.user && !userType) {
    const url = request.nextUrl.clone()
    url.pathname = "/cadastro/tipo-conta"
    url.search = ""
    return NextResponse.redirect(url)
  }

  // Ja autenticado em pagina de auth -> dashboard correto para o tipo
  if (isAuthPage && session?.user) {
    const url = request.nextUrl.clone()
    url.pathname = homeFor(userType)
    url.search = ""
    return NextResponse.redirect(url)
  }

  // Redirecionamento de área por tipo: conveniência de UX apenas.
  // A barreira de segurança real está nos layouts server-side (professor/layout.tsx,
  // aluno/layout.tsx) que consultam o banco a cada navegação — não o JWT, que pode ficar stale.
  if (isDashboard && session?.user && userType) {
    const inWrongArea =
      (userType === "professor" && pathname.startsWith("/dashboard/aluno")) ||
      (userType === "aluno" && pathname.startsWith("/dashboard/professor"))
    if (inWrongArea) {
      const url = request.nextUrl.clone()
      url.pathname = homeFor(userType)
      url.search = ""
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
