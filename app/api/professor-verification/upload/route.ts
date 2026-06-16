import { NextResponse } from "next/server"
import { put } from "@/lib/blob"
import { randomUUID } from "crypto"
import { auth } from "@/auth"
import { query, queryOne } from "@/lib/db/query"
import { safeUploadFilename } from "@/lib/activities/attachments"

export const runtime = "nodejs"

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
])

export async function POST(request: Request) {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" },
      { status: 500 }
    )
  }

  const profile = await queryOne<{ user_type: string }>(
    "select user_type from public.profiles where id = $1",
    [userId]
  )
  if (profile?.user_type !== "professor") {
    return NextResponse.json({ ok: false, error: "Apenas professores" }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo invalido" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Arquivo obrigatorio" }, { status: 400 })
  }
  if (!file.size || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "Arquivo vazio" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Arquivo muito grande (max 5MB)" }, { status: 400 })
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Tipo de arquivo nao permitido" }, { status: 400 })
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `professor-verification/${userId}/${randomUUID()}-${safe}`

  try {
    const blob = await put(pathname, file, {
      access: "private",
      token,
      contentType: file.type || undefined,
    })

    await query(
      `update public.profiles
       set professor_verification_status = 'pending',
           professor_verification_doc_url = $2,
           professor_verification_submitted_at = timezone('utc'::text, now())
       where id = $1`,
      [userId, blob.url]
    )

    return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname })
  } catch (e: any) {
    if (process.env.NODE_ENV !== "production") {
      console.error("/api/professor-verification/upload failed:", e)
    }
    return NextResponse.json({ ok: false, error: "Falha no upload" }, { status: 500 })
  }
}

