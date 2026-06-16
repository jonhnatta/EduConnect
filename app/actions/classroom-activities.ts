"use server"

import { del, put } from "@/lib/blob"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { requireAuthedUser } from "@/lib/auth/user"
import { getProfessorActionAccess } from "@/lib/auth/guards"
import { query, queryOne } from "@/lib/db/query"
import type {
  ActivityAttachment,
} from "@/lib/activities/attachments"
import {
  ACTIVITY_ATTACHMENT_MAX_BYTES,
  ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY,
  assertAttachmentsBelongToClassroom,
  effectiveContentType,
  isAllowedActivityAttachmentType,
  parseActivityAttachments,
  safeUploadFilename,
} from "@/lib/activities/attachments"
import { sanitizeActivityHtml } from "@/lib/sanitize-activity-html"
import {
  mergeActivitySettings,
  totalExamPoints,
  validateExamDefinition,
  type ActivityExamDefinition,
} from "@/lib/activities/exam"
import type {
  ClassroomActivityRow,
  ClassroomActivityStatus,
  ClassroomActivityType,
} from "@/lib/activities/types"

const TRIX_IMAGE_MAX_BYTES = 5 * 1024 * 1024

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

export type CreateActivityInput = {
  classroomId: string
  type: ClassroomActivityType
  title: string
  description: string
  startsAt: string | null
  dueAt: string | null
  maxScore: number | null
  status: ClassroomActivityStatus
  attachments?: ActivityAttachment[]
  /** Questoes da prova (settings.exam); null ou vazio = sem prova estruturada */
  exam?: ActivityExamDefinition | null
}

export type UpdateActivityInput = {
  id: string
  classroomId: string
  type?: ClassroomActivityType
  title?: string
  description?: string
  startsAt?: string | null
  dueAt?: string | null
  maxScore?: number | null
  status?: ClassroomActivityStatus
  attachments?: ActivityAttachment[]
  exam?: ActivityExamDefinition | null
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

export async function uploadActivityAttachmentFiles(
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
      if (
        !isAllowedActivityAttachmentType(
          file.type,
          file.name
        )
      ) {
        throw new Error(
          "Tipo nao permitido. Use PDF, Word (.doc/.docx) ou imagem (JPEG, PNG, GIF, WebP)"
        )
      }
      const safe = safeUploadFilename(file.name)
      const pathname = `classroom-activities/${classroomId}/${randomUUID()}-${safe}`
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
    const msg =
      e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }
}

export async function listActivitiesForClassroomAsProfessor(
  classroomId: string
): Promise<{ rows: ClassroomActivityRow[]; error: string | null }> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { rows: [], error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { rows: [], error: "Sala nao encontrada" }

  try {
    const data = await query<ClassroomActivityRow>(
      "select * from public.classroom_activities where classroom_id = $1 order by due_at asc nulls last",
      [classroomId]
    )
    return { rows: data ?? [], error: null }
  } catch (e: any) {
    return { rows: [], error: e?.message ?? "Erro ao listar atividades" }
  }
}

export async function listActivitiesForClassroomAsStudent(
  classroomId: string
): Promise<{ rows: ClassroomActivityRow[]; error: string | null }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { rows: [], error: "Nao autenticado" }

  const member = await queryOne<{ id: string }>(
    "select id from public.classroom_members where classroom_id = $1 and student_id = $2",
    [classroomId, user.id]
  )

  if (!member) return { rows: [], error: "Voce nao participa desta sala" }

  // Student cannot see drafts.
  try {
    const data = await query<ClassroomActivityRow>(
      "select * from public.classroom_activities where classroom_id = $1 and status <> 'rascunho' order by due_at asc nulls last",
      [classroomId]
    )
    return { rows: data ?? [], error: null }
  } catch (e: any) {
    return { rows: [], error: e?.message ?? "Erro ao listar atividades" }
  }
}

export async function getActivityForStudent(
  classroomId: string,
  activityId: string
): Promise<{ row: ClassroomActivityRow | null; error: string | null }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { row: null, error: "Nao autenticado" }

  const member = await queryOne<{ id: string }>(
    "select id from public.classroom_members where classroom_id = $1 and student_id = $2",
    [classroomId, user.id]
  )

  if (!member) return { row: null, error: "Voce nao participa desta sala" }

  const data = await queryOne<ClassroomActivityRow>(
    "select * from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )
  if (!data) return { row: null, error: null }
  const row = data
  if (row.status === "rascunho") return { row: null, error: null }
  return { row, error: null }
}

/** Imagem embutida no Trix (path sob classroom-activities/.../trix/). */
export async function uploadTrixActivityImage(
  classroomId: string,
  formData: FormData
): Promise<
  | { ok: true; displayUrl: string; pathname: string }
  | { ok: false; error: string }
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ok = await assertProfessorOwnsClassroom(classroomId, user.id)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Nenhum arquivo" }
  }
  if (file.size > TRIX_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: `Imagem muito grande (max ${TRIX_IMAGE_MAX_BYTES / 1024 / 1024} MB)`,
    }
  }
  const isImage =
    /^image\/(jpeg|png|gif|webp)$/i.test(file.type) ||
    (!file.type?.trim() &&
      /\.(jpe?g|png|gif|webp)$/i.test(file.name))
  if (!isImage) {
    return { ok: false, error: "Apenas imagens JPEG, PNG, GIF ou WebP" }
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `classroom-activities/${classroomId}/trix/${randomUUID()}-${safe}`
  const contentType = effectiveContentType(file)
  try {
    const blob = await put(pathname, file, {
      access: "private",
      token,
      contentType,
    })
    const displayUrl = `/api/activity-attachment?pathname=${encodeURIComponent(blob.pathname)}&filename=${encodeURIComponent(file.name)}`
    return { ok: true, displayUrl, pathname: blob.pathname }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }
}

export async function createActivity(
  input: CreateActivityInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  const ok = await assertProfessorOwnsClassroom(input.classroomId, user.id)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const attachments = input.attachments ?? []
  if (attachments.length > ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY) {
    return { ok: false, error: "Numero de anexos acima do permitido" }
  }
  const attachErr = assertAttachmentsBelongToClassroom(
    attachments,
    input.classroomId
  )
  if (attachErr) return { ok: false, error: attachErr }

  if (input.exam != null) {
    const exErr = validateExamDefinition(input.exam)
    if (exErr) return { ok: false, error: exErr }
  }

  const descriptionHtml = sanitizeActivityHtml(input.description.trim() || "")

  const settings = mergeActivitySettings(
    {},
    {
      attachments,
      exam: input.exam ?? null,
    }
  )

  let maxScore = input.maxScore
  if (input.exam && input.exam.questions.length > 0) {
    maxScore = totalExamPoints(input.exam)
  }

  let data: { id: string } | null = null
  try {
    data = await queryOne<{ id: string }>(
      `insert into public.classroom_activities
        (classroom_id, type, title, description, starts_at, due_at, max_score, status, settings)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       returning id`,
      [
        input.classroomId,
        input.type,
        title,
        descriptionHtml || null,
        input.startsAt || null,
        input.dueAt || null,
        maxScore,
        input.status,
        JSON.stringify(settings),
      ]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao criar" }
  }
  if (!data) return { ok: false, error: "Erro ao criar" }
  revalidatePath(`/dashboard/professor/salas/${input.classroomId}`)
  revalidatePath(`/dashboard/aluno/salas/${input.classroomId}`)
  revalidatePath(
    `/dashboard/aluno/salas/${input.classroomId}/atividades/${data.id}`
  )
  return { ok: true, id: data.id }
}

export async function updateActivity(
  input: UpdateActivityInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ok = await assertProfessorOwnsClassroom(input.classroomId, user.id)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const patch: Record<string, unknown> = {}
  if (input.type !== undefined) patch.type = input.type
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) return { ok: false, error: "Titulo obrigatorio" }
    patch.title = t
  }
  if (input.description !== undefined) {
    patch.description =
      sanitizeActivityHtml(input.description.trim() || "") || null
  }
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt || null
  if (input.dueAt !== undefined) patch.due_at = input.dueAt || null
  if (input.maxScore !== undefined) patch.max_score = input.maxScore
  if (input.status !== undefined) patch.status = input.status

  if (input.exam != null) {
    const exErr = validateExamDefinition(input.exam)
    if (exErr) return { ok: false, error: exErr }
  }

  if (input.attachments !== undefined || input.exam !== undefined) {
    if (input.attachments !== undefined) {
      if (input.attachments.length > ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY) {
        return { ok: false, error: "Numero de anexos acima do permitido" }
      }
      const attachErr = assertAttachmentsBelongToClassroom(
        input.attachments,
        input.classroomId
      )
      if (attachErr) return { ok: false, error: attachErr }
    }

    const row = await queryOne<{ settings: any }>(
      "select settings from public.classroom_activities where id = $1 and classroom_id = $2",
      [input.id, input.classroomId]
    )

    const old = parseActivityAttachments(
      asRecord(row?.settings)
    )
    if (input.attachments !== undefined) {
      const newUrls = new Set(input.attachments.map((a) => a.url))
      const removedUrls = old.filter((a) => !newUrls.has(a.url)).map((a) => a.url)
      await deleteAttachmentBlobs(removedUrls)
    }

    const current = asRecord(row?.settings)
    const settingsPatch: {
      attachments?: ActivityAttachment[]
      exam?: ActivityExamDefinition | null
    } = {}
    if (input.attachments !== undefined) {
      settingsPatch.attachments = input.attachments
    }
    if (input.exam !== undefined) {
      settingsPatch.exam = input.exam
    }
    patch.settings = mergeActivitySettings(current, settingsPatch)

    if (input.exam !== undefined) {
      if (input.exam && input.exam.questions.length > 0) {
        patch.max_score = totalExamPoints(input.exam)
      } else if (input.maxScore !== undefined) {
        patch.max_score = input.maxScore
      }
    }
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
      `update public.classroom_activities set ${sets.join(", ")} where id = $${i} and classroom_id = $${i + 1}`,
      values
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao atualizar" }
  }
  revalidatePath(`/dashboard/professor/salas/${input.classroomId}`)
  revalidatePath(`/dashboard/aluno/salas/${input.classroomId}`)
  revalidatePath(
    `/dashboard/aluno/salas/${input.classroomId}/atividades/${input.id}`
  )
  return { ok: true }
}

export async function deleteActivity(
  activityId: string,
  classroomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ok = await assertProfessorOwnsClassroom(classroomId, user.id)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const existing = await queryOne<{ settings: any }>(
    "select settings from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )

  const urls = parseActivityAttachments(
    asRecord(existing?.settings)
  ).map((a) => a.url)
  await deleteAttachmentBlobs(urls)

  try {
    await query("delete from public.classroom_activities where id = $1 and classroom_id = $2", [
      activityId,
      classroomId,
    ])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao excluir" }
  }
  revalidatePath(`/dashboard/professor/salas/${classroomId}`)
  revalidatePath(`/dashboard/aluno/salas/${classroomId}`)
  return { ok: true }
}
