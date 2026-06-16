import { get } from "@/lib/blob"
import { NextRequest, NextResponse } from "next/server"
import { queryOne } from "@/lib/db/query"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Caminho esperado: profiles/<uuid-do-perfil>/<avatar|cover>-...
function extractProfileId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "profiles" || !parts[1]) return null
  return UUID_RE.test(parts[1]) ? parts[1] : null
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

  const row = await queryOne<{ id: string }>(
    "select id from public.profiles where id = $1",
    [profileId]
  )
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
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

  return new NextResponse(result.stream, {
    status: 200,
    headers: outHeaders,
  })
}
