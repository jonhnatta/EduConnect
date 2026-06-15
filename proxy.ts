import { auth } from "@/auth"
import { NextResponse, type NextRequest } from "next/server"

function homeFor(userType?: string | null): string {
  if (userType === "professor") return "/dashboard/professor"
  if (userType === "aluno") return "/dashboard/aluno"
  return "/cadastro/tipo-conta"
}

export async function proxy(request: NextRequest) {
  const session = await auth()
  const { pathname } = request.nextUrl
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
