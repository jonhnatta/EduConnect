"use server"

import { del, put } from "@/lib/blob"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { requireAuthedUser } from "@/lib/auth/user"
import { getProfessorActionAccess } from "@/lib/auth/guards"
import { query, queryOne } from "@/lib/db/query"
import type { ActivityAttachment } from "@/lib/activities/attachments"
import {
  ACTIVITY_ATTACHMENT_MAX_BYTES,
  ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY,
  assertBlobAttachmentsForClassroom,
  effectiveContentType,
  isAllowedActivityAttachmentType,
  parseActivityAttachments,
  safeUploadFilename,
} from "@/lib/activities/attachments"
import type {
  ClassroomMaterialRow,
  CreateMaterialInput,
  UpdateMaterialInput,
} from "@/lib/materials/types"

function asRecord(v: unknown): Record<string, unknown> {
  if (!v) return {}
  if (typeof v === "object") return v as Record<string, unknown>
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v)
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return {}
}

async function assertProfessorOwnsClassroom(
  classroomId: string,
  userId: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "select id from public.classrooms where id = $1 and professor_id = $2",
    [classroomId, userId]
  )
  return !!row
}

async function deleteAttachmentBlobs(urls: string[]) {
  await Promise.all(urls.map((url) => del(url).catch(() => {})))
}

function normalizeExternalUrl(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null
  let t = String(raw).trim()
  if (t.startsWith("http://")) t = `https://${t.slice(7)}`
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`
  try {
    const u = new URL(t)
    if (u.protocol !== "https:") return null
    return u.toString()
  } catch {
    return null
  }
}

export async function uploadMaterialAttachmentFiles(
  classroomId: string,
  formData: FormData
): Promise<
  { ok: true; attachments: ActivityAttachment[] } | { ok: false; error: string }
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const access = await getProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const raw = formData.getAll("files")
  const files = raw.filter((x): x is File => x instanceof File && x.size > 0)
  if (files.length === 0) {
    return { ok: false, error: "Nenhum arquivo selecionado" }
  }
  if (files.length > ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY) {
    return {
      ok: false,
      error: `No maximo ${ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY} arquivos por vez`,
    }
  }

  const uploaded: ActivityAttachment[] = []
  try {
    for (const file of files) {
      if (file.size > ACTIVITY_ATTACHMENT_MAX_BYTES) {
        throw new Error(
          `Arquivo muito grande (max ${Math.round(ACTIVITY_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB)`
        )
      }
      if (!isAllowedActivityAttachmentType(file.type, file.name)) {
        throw new Error(
          "Tipo nao permitido. Use PDF, Word (.doc/.docx) ou imagem (JPEG, PNG, GIF, WebP)"
        )
      }
      const safe = safeUploadFilename(file.name)
      const pathname = `classroom-materials/${classroomId}/${randomUUID()}-${safe}`
      const contentType = effectiveContentType(file)
      const blob = await put(pathname, file, {
        access: "private",
        token,
        contentType,
      })
      const now = new Date().toISOString()
      uploaded.push({
        url: blob.url,
        pathname: blob.pathname,
        filename: file.name,
        contentType,
        size: file.size,
        uploadedAt: now,
      })
    }
    return { ok: true, attachments: uploaded }
  } catch (e) {
    await deleteAttachmentBlobs(uploaded.map((a) => a.url))
    const msg = e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }
}

export async function listMaterialsForClassroomAsProfessor(
  classroomId: string
): Promise<{ rows: ClassroomMaterialRow[]; error: string | null }> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { rows: [], error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { rows: [], error: "Sala nao encontrada" }

  try {
    const data = await query<ClassroomMaterialRow>(
      "select * from public.classroom_materials where classroom_id = $1 order by created_at desc",
      [classroomId]
    )
    return { rows: data ?? [], error: null }
  } catch (e: any) {
    return { rows: [], error: e?.message ?? "Erro ao listar materiais" }
  }
}

export async function listMaterialsForClassroomAsStudent(
  classroomId: string
): Promise<{ rows: ClassroomMaterialRow[]; error: string | null }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { rows: [], error: "Nao autenticado" }

  const member = await queryOne<{ id: string }>(
    "select id from public.classroom_members where classroom_id = $1 and student_id = $2",
    [classroomId, user.id]
  )

  if (!member) return { rows: [], error: "Voce nao participa desta sala" }

  try {
    const data = await query<ClassroomMaterialRow>(
      "select * from public.classroom_materials where classroom_id = $1 and status = 'publicado' order by created_at desc",
      [classroomId]
    )
    return { rows: data ?? [], error: null }
  } catch (e: any) {
    return { rows: [], error: e?.message ?? "Erro ao listar materiais" }
  }
}

export async function createMaterial(
  input: CreateMaterialInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  const ok = await assertProfessorOwnsClassroom(input.classroomId, access.userId)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const externalUrl = normalizeExternalUrl(input.externalUrl)
  if (input.externalUrl?.trim() && !externalUrl) {
    return { ok: false, error: "Link externo invalido (use https)" }
  }

  const attachments = input.attachments ?? []
  if (attachments.length > ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY) {
    return { ok: false, error: "Numero de anexos acima do permitido" }
  }
  const attachErr = assertBlobAttachmentsForClassroom(
    attachments,
    input.classroomId,
    "material"
  )
  if (attachErr) return { ok: false, error: attachErr }

  let data: { id: string } | null = null
  try {
    data = await queryOne<{ id: string }>(
      `insert into public.classroom_materials
        (classroom_id, title, description, external_url, status, settings)
       values ($1,$2,$3,$4,$5,$6::jsonb)
       returning id`,
      [
        input.classroomId,
        title,
        input.description.trim() || null,
        externalUrl,
        input.status,
        JSON.stringify({ attachments }),
      ]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao criar" }
  }
  if (!data) return { ok: false, error: "Erro ao criar" }
  revalidatePath(`/dashboard/professor/salas/${input.classroomId}`)
  revalidatePath(`/dashboard/aluno/salas/${input.classroomId}`)
  return { ok: true, id: data.id }
}

export async function updateMaterial(
  input: UpdateMaterialInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const ok = await assertProfessorOwnsClassroom(input.classroomId, access.userId)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) return { ok: false, error: "Titulo obrigatorio" }
    patch.title = t
  }
  if (input.description !== undefined)
    patch.description = input.description.trim() || null
  if (input.externalUrl !== undefined) {
    const externalUrl = normalizeExternalUrl(input.externalUrl)
    if (input.externalUrl?.trim() && !externalUrl) {
      return { ok: false, error: "Link externo invalido (use https)" }
    }
    patch.external_url = externalUrl
  }
  if (input.status !== undefined) patch.status = input.status

  if (input.attachments !== undefined) {
    if (input.attachments.length > ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY) {
      return { ok: false, error: "Numero de anexos acima do permitido" }
    }
    const attachErr = assertBlobAttachmentsForClassroom(
      input.attachments,
      input.classroomId,
      "material"
    )
    if (attachErr) return { ok: false, error: attachErr }

    const row = await queryOne<{ settings: any }>(
      "select settings from public.classroom_materials where id = $1 and classroom_id = $2",
      [input.id, input.classroomId]
    )

    const old = parseActivityAttachments(
      asRecord(row?.settings)
    )
    const newUrls = new Set(input.attachments.map((a) => a.url))
    const removedUrls = old.filter((a) => !newUrls.has(a.url)).map((a) => a.url)
    await deleteAttachmentBlobs(removedUrls)

    const current = asRecord(row?.settings)
    patch.settings = { ...current, attachments: input.attachments }
  }

  if (Object.keys(patch).length === 0) return { ok: true }

  const sets: string[] = []
  const values: any[] = []
  let i = 1
  for (const [k, v] of Object.entries(patch)) {
    if (k === "settings") {
      sets.push(`${k} = $${i}::jsonb`)
      values.push(JSON.stringify(v))
    } else {
      sets.push(`${k} = $${i}`)
      values.push(v)
    }
    i++
  }
  values.push(input.id, input.classroomId)
  try {
    await query(
      `update public.classroom_materials set ${sets.join(", ")} where id = $${i} and classroom_id = $${i + 1}`,
      values
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao atualizar" }
  }
  revalidatePath(`/dashboard/professor/salas/${input.classroomId}`)
  revalidatePath(`/dashboard/aluno/salas/${input.classroomId}`)
  return { ok: true }
}

export async function deleteMaterial(
  materialId: string,
  classroomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ok = await assertProfessorOwnsClassroom(classroomId, user.id)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const existing = await queryOne<{ settings: any }>(
    "select settings from public.classroom_materials where id = $1 and classroom_id = $2",
    [materialId, classroomId]
  )

  const urls = parseActivityAttachments(
    asRecord(existing?.settings)
  ).map((a) => a.url)
  await deleteAttachmentBlobs(urls)

  try {
    await query("delete from public.classroom_materials where id = $1 and classroom_id = $2", [
      materialId,
      classroomId,
    ])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao excluir" }
  }
  revalidatePath(`/dashboard/professor/salas/${classroomId}`)
  revalidatePath(`/dashboard/aluno/salas/${classroomId}`)
  return { ok: true }
}
