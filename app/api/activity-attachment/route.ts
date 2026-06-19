import { get } from "@/lib/blob"
import { NextRequest, NextResponse } from "next/server"
import { getAuthedUser } from "@/lib/auth/user"
import { queryOne } from "@/lib/db/query"
import { applySafeServingHeaders } from "@/lib/http/safe-serving"

export const runtime = "nodejs"

const ALLOWED_PREFIXES = [
  /^classroom-activities\/([^/]+)\//,
  /^classroom-materials\/([^/]+)\//,
  /^classroom-mural\/([^/]+)\//,
]

function extractClassroomId(pathname: string): string | null {
  if (pathname.includes("..") || pathname.includes("//") || pathname.includes("\\")) {
    return null
  }
  for (const re of ALLOWED_PREFIXES) {
    const m = pathname.match(re)
    if (m?.[1]) return m[1]
  }
  return null
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

  const classroomId = extractClassroomId(pathname)
  if (!classroomId) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  const user = await getAuthedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const room = await queryOne<{ professor_id: string }>(
    "select professor_id from public.classrooms where id = $1",
    [classroomId]
  )

  if (!room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const isProfessor = room.professor_id === user.id
  if (!isProfessor) {
    const member = await queryOne<{ id: string }>(
      "select id from public.classroom_members where classroom_id = $1 and student_id = $2",
      [classroomId, user.id]
    )
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Entregas de aluno (submissions/{activityId}/{studentId}/...) são confidenciais:
  // só o próprio aluno dono ou o professor da sala podem baixar.
  const submissionMatch = pathname.match(
    /^classroom-activities\/[^/]+\/submissions\/[^/]+\/([^/]+)\//
  )
  if (submissionMatch && !isProfessor && submissionMatch[1] !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
