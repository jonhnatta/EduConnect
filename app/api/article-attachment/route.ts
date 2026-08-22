import { get } from "@/lib/blob"
import { NextRequest, NextResponse } from "next/server"
import { queryOne } from "@/lib/db/query"
import { getAuthedUser } from "@/lib/auth/user"
import { applySafeServingHeaders } from "@/lib/http/safe-serving"
import { contentItemIdFromArticlePath } from "@/lib/http/blob-paths"

export const runtime = "nodejs"

function extractContentItemId(pathname: string): string | null {
  return contentItemIdFromArticlePath(pathname)
}

function sanitizeDownloadFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200) || "download"
}

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname")
  const filenameParam = request.nextUrl.searchParams.get("filename")

  if (!pathname) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  const contentItemId = extractContentItemId(pathname)
  if (!contentItemId) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  // Autorizacao real (a RLS e inerte): so serve a midia se o solicitante pode ver o conteudo.
  // user_can_view_content_item libera publicado+publico a qualquer um (inclusive anonimo),
  // e restringe rascunho/privado ao autor e conteudo de turma a membros.
  const user = await getAuthedUser()
  const access = await queryOne<{ can_view: boolean }>(
    "select public.user_can_view_content_item($1::uuid, $2::uuid) as can_view",
    [contentItemId, user?.id ?? null]
  ).catch(() => null)

  if (access?.can_view !== true) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

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
  const friendly = filenameParam
    ? sanitizeDownloadFilename(filenameParam)
    : pathname.split("/").pop() ?? "file"
  applySafeServingHeaders(outHeaders, friendly)

  return new NextResponse(result.stream, {
    status: 200,
    headers: outHeaders,
  })
}
