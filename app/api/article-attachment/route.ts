import { get } from "@/lib/blob"
import { NextRequest, NextResponse } from "next/server"
import { queryOne } from "@/lib/db/query"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function extractContentItemId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "articles" || !parts[1]) return null
  return UUID_RE.test(parts[1]) ? parts[1] : null
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

  const row = await queryOne<{ id: string }>(
    "select id from public.content_items where id = $1",
    [contentItemId]
  )

  if (!row) {
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
  if (!outHeaders.has("content-disposition")) {
    outHeaders.set(
      "content-disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(friendly)}`
    )
  }

  return new NextResponse(result.stream, {
    status: 200,
    headers: outHeaders,
  })
}
