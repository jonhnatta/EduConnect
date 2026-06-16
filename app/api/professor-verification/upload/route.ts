import { NextResponse } from "next/server"
import { after } from "next/server"
import { put } from "@/lib/blob"
import { randomUUID } from "crypto"
import { auth } from "@/auth"
import { query, queryOne } from "@/lib/db/query"
import { safeUploadFilename } from "@/lib/activities/attachments"
import { analyzeProfessorDocument } from "@/lib/professor-verification/analyze"

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

  const profile = await queryOne<{ user_type: string; full_name: string | null; interests: string[] | null }>(
    "select user_type, full_name, interests from public.profiles where id = $1",
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
  // MIME obrigatorio: antes, file.type vazio (trivial de forjar no multipart) pulava a
  // validacao e permitia armazenar arquivo arbitrario marcando o professor como 'pending'.
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Tipo de arquivo nao permitido (envie PDF, JPEG ou PNG)" }, { status: 400 })
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `professor-verification/${userId}/${randomUUID()}-${safe}`
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type

  try {
    const blob = await put(pathname, fileBuffer, {
      access: "private",
      token,
      contentType: contentType || undefined,
    })

    // Estado inicial: em análise pela IA. 'pending' SEM manual_requested_at = fila automática
    // (não aparece no relatório humano, que filtra manual_requested_at IS NOT NULL).
    await query(
      `update public.profiles
       set professor_verification_status = 'pending',
           professor_verification_doc_url = $2,
           professor_verification_submitted_at = timezone('utc'::text, now()),
           professor_verification_ai_reason = null,
           professor_verification_manual_requested_at = null,
           professor_verification_reviewed_at = null
       where id = $1`,
      [userId, blob.url]
    )

    // Análise automática após a resposta (não bloqueia o upload).
    const isImage = /^image\/(jpeg|png|webp)$/i.test(contentType)
    after(async () => {
      try {
        const decision = await analyzeProfessorDocument({
          contentType,
          fullName: profile.full_name ?? null,
          interests: profile.interests ?? null,
          imageBase64: isImage ? fileBuffer.toString("base64") : null,
        })
        const newStatus = decision.decision === "approved" ? "approved" : "rejected"
        // Só atualiza se ainda estiver na fila da IA (evita sobrescrever pedido manual concorrente).
        await query(
          `update public.profiles
             set professor_verification_status = $2,
                 professor_verification_ai_reason = $3,
                 professor_verification_reviewed_at = timezone('utc'::text, now())
           where id = $1
             and professor_verification_status = 'pending'
             and professor_verification_manual_requested_at is null`,
          [userId, newStatus, decision.reason]
        )
      } catch (err) {
        console.error("[professor-verification] análise automática falhou:", err)
      }
    })

    return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname })
  } catch (e: any) {
    if (process.env.NODE_ENV !== "production") {
      console.error("/api/professor-verification/upload failed:", e)
    }
    return NextResponse.json({ ok: false, error: "Falha no upload" }, { status: 500 })
  }
}

