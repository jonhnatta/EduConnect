import { NextRequest, NextResponse } from "next/server"
import { getAdminMfaAccess } from "@/lib/auth/admin"
import { get } from "@/lib/blob"
import { query, queryOne } from "@/lib/db/query"
import { applySafeServingHeaders } from "@/lib/http/safe-serving"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const admin = await getAdminMfaAccess()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const professorId = request.nextUrl.searchParams.get("professorId")
  if (!professorId || !/^[0-9a-f-]{36}$/i.test(professorId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const profile = await queryOne<{ professor_verification_doc_url: string | null }>(
    `select professor_verification_doc_url
       from public.profiles
      where id = $1 and user_type = 'professor'
        and professor_verification_doc_status = 'clean'`,
    [professorId]
  )
  if (!profile?.professor_verification_doc_url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const result = await get(profile.professor_verification_doc_url, { access: "private" })
  if (!result?.stream) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await query(
    `insert into public.admin_audit_events
       (admin_user_id, action, target_type, target_id)
     values ($1, 'professor.document.viewed', 'profile', $2)`,
    [admin.userId, professorId]
  )
  const headers = new Headers()
  result.headers.forEach((value, key) => headers.set(key, value))
  applySafeServingHeaders(headers, `comprovante-professor-${professorId}`)
  headers.set("cache-control", "no-store, private")
  headers.set("content-security-policy", "sandbox")
  return new NextResponse(result.stream, { headers })
}
