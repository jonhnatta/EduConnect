import { get } from "@/lib/blob"
import { NextRequest, NextResponse } from "next/server"
import { queryOne } from "@/lib/db/query"
import { getAuthedUser } from "@/lib/auth/user"
import { applySafeServingHeaders } from "@/lib/http/safe-serving"
import { profileIdFromProfilePath } from "@/lib/http/blob-paths"

export const runtime = "nodejs"

// Caminho esperado: profiles/<uuid-do-perfil>/<avatar|cover>-...
function extractProfileId(pathname: string): string | null {
  return profileIdFromProfilePath(pathname)
}

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname")
  if (!pathname) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  const profileId = extractProfileId(pathname)
  if (!profileId) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  const row = await queryOne<{ id: string; profile_visibility: string }>(
    "select id, profile_visibility from public.profiles where id = $1",
    [profileId]
  )
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Perfil privado pertence exclusivamente ao dono. Autenticacao, sozinha, nao concede acesso.
  if (row.profile_visibility !== "public") {
    const user = await getAuthedUser()
    if (user?.id !== profileId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  // Store privado: streama o conteudo via token. Fallback para public por compatibilidade
  // com imagens enviadas antes da migracao para acesso privado.
  let result: Awaited<ReturnType<typeof get>> = null
  try {
    result = await get(pathname, { access: "private", token })
  } catch {
    result = null
  }
  if (!result?.stream) {
    try {
      result = await get(pathname, { access: "public", token })
    } catch {
      result = null
    }
  }
  if (!result?.stream) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const outHeaders = new globalThis.Headers()
  result.headers.forEach((value, key) => {
    outHeaders.append(key, value)
  })
  outHeaders.set("cache-control", "private, max-age=3600")
  applySafeServingHeaders(outHeaders, pathname.split("/").pop() ?? "image")

  return new NextResponse(result.stream, {
    status: 200,
    headers: outHeaders,
  })
}
