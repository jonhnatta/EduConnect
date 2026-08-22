import { NextResponse } from "next/server"
import { put, del } from "@/lib/blob"
import { randomUUID } from "crypto"
import { auth } from "@/auth"
import { query, queryOne } from "@/lib/db/query"
import { safeUploadFilename } from "@/lib/activities/attachments"
import { matchesDeclaredDocumentType } from "@/lib/security/file-signature"
import { checkRateLimit } from "@/lib/security/rate-limit"

export const runtime = "nodejs"

const MAX_BYTES = 5 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_BYTES + 256 * 1024
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
  const allowed = await checkRateLimit(`professor-document:${userId}`, 5, 24 * 3600, { failClosed: true })
  if (!allowed) return NextResponse.json({ ok: false, error: "Limite de envios excedido" }, { status: 429 })

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (process.env.NODE_ENV === "production" && (!Number.isFinite(contentLength) || contentLength <= 0)) {
    return NextResponse.json({ ok: false, error: "Content-Length obrigatorio" }, { status: 411 })
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, error: "Arquivo muito grande (max 5MB)" }, { status: 413 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" },
      { status: 500 }
    )
  }

  const profile = await queryOne<{ user_type: string; full_name: string | null; interests: string[] | null; professor_verification_doc_url: string | null }>(
    "select user_type, full_name, interests, professor_verification_doc_url from public.profiles where id = $1",
    [userId]
  )
  if (profile?.user_type !== "professor") {
    return NextResponse.json({ ok: false, error: "Apenas professores" }, { status: 403 })
  }
  const previousDocUrl = profile.professor_verification_doc_url

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
  // MIME obrigatorio: antes, file.type vazio (trivial de forjar no multipart) pulava a
  // validacao e permitia armazenar arquivo arbitrario marcando o professor como 'pending'.
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Tipo de arquivo nao permitido (envie PDF, JPEG ou PNG)" }, { status: 400 })
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `professor-verification/${userId}/${randomUUID()}-${safe}`
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type
  if (!matchesDeclaredDocumentType(fileBuffer, contentType)) {
    return NextResponse.json(
      { ok: false, error: "O conteudo do arquivo nao corresponde ao tipo informado" },
      { status: 400 }
    )
  }

  let uploadedPath: string | null = null
  try {
    const blob = await put(pathname, fileBuffer, {
      access: "private",
      token,
      contentType: contentType || undefined,
    })
    uploadedPath = blob.pathname

    // IA fica desligada no primeiro lancamento. Toda submissao entra na fila humana.
    await query(
      `update public.profiles
       set professor_verification_status = 'pending',
           professor_verification_doc_status = 'clean',
           professor_verification_doc_url = $2,
           professor_verification_submitted_at = timezone('utc'::text, now()),
           professor_verification_ai_reason = null,
           professor_verification_manual_requested_at = timezone('utc'::text, now()),
           professor_verification_reviewed_at = null
       where id = $1`,
      [userId, blob.url]
    )

    // Remove o documento anterior (evita acúmulo de PII de identidade órfã no storage).
    if (previousDocUrl && previousDocUrl !== blob.url) {
      await del(previousDocUrl).catch(() => {})
    }

    return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname })
  } catch (e: any) {
    if (uploadedPath) await del(uploadedPath).catch(() => {})
    if (process.env.NODE_ENV !== "production") {
      console.error("/api/professor-verification/upload failed:", e)
    }
    return NextResponse.json({ ok: false, error: "Falha no upload" }, { status: 500 })
  }
}
