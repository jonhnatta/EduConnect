import {
  uploadArticleCoverImage,
  uploadArticleCoverVideo,
  uploadDicaImage,
  uploadTrixArticleImage,
} from "@/app/actions/content-items"
import { NextResponse } from "next/server"
import { getAuthedUser } from "@/lib/auth/user"
import { checkRateLimit } from "@/lib/security/rate-limit"

export const runtime = "nodejs"

const KINDS = new Set(["trix", "cover-image", "cover-video", "dica-image"])
const MAX_REQUEST_BYTES = 16 * 1024 * 1024

export async function POST(request: Request) {
  const user = await getAuthedUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 })
  }
  const allowed = await checkRateLimit(`article-upload:${user.id}`, 30, 3600, { failClosed: true })
  if (!allowed) return NextResponse.json({ ok: false, error: "Limite de uploads excedido" }, { status: 429 })
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (process.env.NODE_ENV === "production" && (!Number.isFinite(contentLength) || contentLength <= 0)) {
    return NextResponse.json({ ok: false, error: "Content-Length obrigatorio" }, { status: 411 })
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, error: "Arquivo muito grande" }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo invalido" }, { status: 400 })
  }

  const kind = formData.get("kind")
  const contentItemId = formData.get("contentItemId")
  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "kind invalido" }, { status: 400 })
  }
  if (typeof contentItemId !== "string" || !contentItemId.trim()) {
    return NextResponse.json({ ok: false, error: "contentItemId obrigatorio" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Nenhum arquivo" }, { status: 400 })
  }

  const uploadForm = new FormData()
  uploadForm.append("file", file)

  let result: Awaited<ReturnType<typeof uploadTrixArticleImage>>
  if (kind === "trix") {
    result = await uploadTrixArticleImage(contentItemId, uploadForm)
  } else if (kind === "cover-image") {
    result = await uploadArticleCoverImage(contentItemId, uploadForm)
  } else if (kind === "dica-image") {
    result = await uploadDicaImage(contentItemId, uploadForm)
  } else {
    result = await uploadArticleCoverVideo(contentItemId, uploadForm)
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result)
}
