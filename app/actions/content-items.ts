"use server"

import { put } from "@/lib/blob"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { getAuthedUser, requireAuthedUser } from "@/lib/auth/user"
import { getApprovedProfessorActionAccess } from "@/lib/auth/guards"
import { query, queryOne } from "@/lib/db/query"
import { runArticleReview } from "@/lib/content/review-agent"
import { notifyFollowersNewContent } from "@/lib/notifications/event"
import {
  effectiveContentType,
  safeUploadFilename,
} from "@/lib/activities/attachments"
import { sanitizeActivityHtml } from "@/lib/sanitize-activity-html"
import {
  mergeActivitySettings,
  parseExamFromSettings,
  toPublicExam,
  validateExamDefinition,
  validateExamQuestionDisciplinas,
  type ActivityExamDefinition,
} from "@/lib/activities/exam"
import {
  DICA_MAX_IMAGES,
  type ContentItemRow,
  type ContentItemSettings,
  type ContentItemStatus,
  type ContentItemType,
  type ContentVisibility,
  type ShareMethod,
} from "@/lib/content/types"

const TRIX_IMAGE_MAX_BYTES = 5 * 1024 * 1024
/** Capa em video (MP4/WebM/MOV) */
const COVER_VIDEO_MAX_BYTES = 80 * 1024 * 1024
const COMMENT_MAX_LENGTH = 1000

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

async function assertOwnsAllClassrooms(professorId: string, classroomIds: string[]): Promise<boolean> {
  const ids = classroomIds.filter((x) => typeof x === "string" && x.trim().length > 0)
  if (ids.length === 0) return false
  const rows = await query<{ id: string }>(
    "select id from public.classrooms where professor_id = $1 and id = any($2::uuid[])",
    [professorId, ids]
  )
  return rows.length === ids.length
}

async function replaceContentItemClassrooms(contentItemId: string, classroomIds: string[] | undefined) {
  await query("delete from public.content_item_classrooms where content_item_id = $1", [contentItemId])
  const ids = (classroomIds ?? []).filter((x) => typeof x === "string" && x.trim().length > 0)
  if (ids.length === 0) return
  await query(
    "insert into public.content_item_classrooms (content_item_id, classroom_id) select $1, unnest($2::uuid[])",
    [contentItemId, ids]
  )
}

function validateDicaMediaForPublish(settings: ContentItemSettings): string | null {
  const v = settings.dicaVideoUrl?.trim() || null
  const raw = settings.dicaImageUrls
  const imgs = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : []
  if (v && imgs.length > 0) {
    return "Use apenas um video ou imagens, nao os dois"
  }
  if (v) return null
  if (imgs.length >= 1 && imgs.length <= DICA_MAX_IMAGES) return null
  if (imgs.length === 0) return "Adicione um video ou 1 imagem"
  return "No maximo 1 imagem"
}

function effectiveVideoContentType(file: File): string {
  if (file.type && /^video\//i.test(file.type)) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (ext === "mp4" || ext === "m4v") return "video/mp4"
  if (ext === "webm") return "video/webm"
  if (ext === "mov") return "video/quicktime"
  return "video/mp4"
}

function isArticleCoverVideoFile(file: File): boolean {
  if (/^video\/(mp4|webm|quicktime|x-m4v|x-msvideo)$/i.test(file.type)) return true
  if (!file.type?.trim() && /\.(mp4|webm|mov|m4v)$/i.test(file.name)) return true
  return false
}

async function assertProfessor() {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) {
    return { user: null as null, error: access.error as "Nao autenticado" | "Apenas professores aprovados" }
  }
  return { user: { id: access.userId }, error: null as null }
}

async function assertOwnsArticle(
  articleId: string,
  userId: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "select id from public.content_items where id = $1 and author_id = $2",
    [articleId, userId]
  )
  return !!row
}

export type ProfessorContentListItem = {
  id: string
  type: ContentItemType
  title: string
  excerpt: string
  disciplina: string | null
  /** URL relativa servida por /api/article-attachment */
  coverUrl: string | null
  coverVideoUrl: string | null
  /** exercise, assessment ou simulado */
  questionCount: number | null
  /** assessment ou simulado publicado (ISO) */
  dueAt: string | null
  status: ContentItemRow["status"]
  visibility: ContentVisibility
  published_at: string | null
  like_count: number
  share_count: number
  comment_count: number
  view_count: number
  updated_at: string
  reviewSeal: "none" | "excellence" | null
  reviewScore: number | null
}

function plainTextExcerpt(html: string | null | undefined, max = 200): string {
  if (!html?.trim()) return ""
  const t = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Artigos e exercícios do professor (rascunhos e publicados), visão tipo feed. */
export async function listMyContentItemsForProfessor(): Promise<
  ProfessorContentListItem[]
> {
  const p = await assertProfessor()
  if (!p.user) return []

  let data: any[] = []
  try {
    data = await query<any>(
      `select
        ci.id, ci.type, ci.title, ci.body_html, ci.status, ci.visibility,
        ci.published_at, ci.like_count, ci.share_count, ci.comment_count, ci.view_count, ci.updated_at, ci.settings,
        crr.score as review_score, crr.seal as review_seal
       from public.content_items ci
       left join public.content_review_results crr on crr.content_item_id = ci.id
       where ci.author_id = $1
         and ci.type = any($2::text[])
       order by ci.updated_at desc`,
      [p.user.id, ["article", "exercise", "assessment", "simulado", "dica"]]
    )
  } catch {
    return []
  }

  type RowWithReview = {
    id: string; type: string; title: string; body_html: string | null
    status: string; visibility: string; published_at: string | null
    like_count: number; share_count: number; comment_count: number; view_count: number; updated_at: string
    settings: Record<string, unknown>
    review_score: number | null
    review_seal: string | null
  }

  return ((data ?? []) as RowWithReview[]).map((row) => {
    const reviewData = row.review_seal ? { seal: row.review_seal, score: row.review_score } : null
    const settings = (row.settings ?? {}) as ContentItemSettings
    const exam = parseExamFromSettings(settings as Record<string, unknown>)
    const qCount = exam?.questions.length ?? null
    const dueIso =
      typeof settings.dueAt === "string" && settings.dueAt.trim()
        ? settings.dueAt.trim()
        : null
    const dicaImages = Array.isArray(settings.dicaImageUrls)
      ? settings.dicaImageUrls.filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0
        )
      : []
    const dicaVid = settings.dicaVideoUrl?.trim() || null
    const excerpt =
      row.type === "exercise" ||
      row.type === "assessment" ||
      row.type === "simulado"
        ? qCount != null && qCount > 0
          ? `${qCount} questao${qCount === 1 ? "" : "es"}${
              (row.type === "assessment" || row.type === "simulado") && dueIso
                ? ` — ate ${new Date(dueIso).toLocaleString("pt-BR")}`
                : ""
            }`
          : plainTextExcerpt(row.body_html)
        : row.type === "dica"
          ? plainTextExcerpt(row.body_html)
          : plainTextExcerpt(row.body_html)
    return {
      id: row.id,
      type: row.type as ContentItemType,
      title: row.title,
      excerpt,
      disciplina: settings.disciplina?.trim() || null,
      coverUrl:
        row.type === "dica"
          ? dicaImages[0] ?? null
          : settings.coverUrl?.trim() || null,
      coverVideoUrl:
        row.type === "dica" ? dicaVid : settings.coverVideoUrl?.trim() || null,
      questionCount:
        row.type === "exercise" ||
        row.type === "assessment" ||
        row.type === "simulado"
          ? qCount
          : null,
      dueAt:
        row.type === "assessment" || row.type === "simulado" ? dueIso : null,
      status: row.status as ContentItemRow["status"],
      visibility: row.visibility as ContentVisibility,
      published_at: row.published_at,
      like_count: row.like_count,
      share_count: row.share_count,
      comment_count: row.comment_count,
      view_count: row.view_count ?? 0,
      updated_at: row.updated_at,
      reviewSeal: (reviewData?.seal as "none" | "excellence") ?? null,
      reviewScore: reviewData?.score ?? null,
    }
  })
}

export async function listMyClassroomsForArticle(): Promise<
  { id: string; name: string; subject: string }[]
> {
  const p = await assertProfessor()
  if (!p.user) return []

  try {
    const rows = await query<{ id: string; name: string; subject: string }>(
      "select id, name, subject from public.classrooms where professor_id = $1 and status = 'ativa' order by name asc",
      [p.user.id]
    )
    return rows.map((r) => ({ id: r.id, name: r.name, subject: r.subject }))
  } catch {
    return []
  }
}

/** Rascunho vazio para obter id antes de uploads Trix no artigo. */
export async function createArticleDraft(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }
  try {
    const row = await queryOne<{ id: string }>(
      `insert into public.content_items
        (author_id, type, title, body_html, status, visibility, settings, created_at, updated_at)
       values ($1, 'article', 'Rascunho', null, 'draft', 'private', '{}'::jsonb, timezone('utc'::text, now()), timezone('utc'::text, now()))
       returning id`,
      [p.user.id]
    )
    if (!row?.id) return { ok: false, error: "Erro ao criar rascunho" }
    return { ok: true, id: row.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao criar rascunho" }
  }
}

export async function createExerciseDraft(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }
  try {
    const row = await queryOne<{ id: string }>(
      `insert into public.content_items
        (author_id, type, title, body_html, status, visibility, settings, created_at, updated_at)
       values ($1, 'exercise', 'Rascunho (exercicio)', null, 'draft', 'private', '{}'::jsonb, timezone('utc'::text, now()), timezone('utc'::text, now()))
       returning id`,
      [p.user.id]
    )
    if (!row?.id) return { ok: false, error: "Erro ao criar rascunho" }
    return { ok: true, id: row.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao criar rascunho" }
  }
}

export async function createAssessmentDraft(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }
  try {
    const row = await queryOne<{ id: string }>(
      `insert into public.content_items
        (author_id, type, title, body_html, status, visibility, settings, created_at, updated_at)
       values ($1, 'assessment', 'Rascunho (avaliacao)', null, 'draft', 'private', '{}'::jsonb, timezone('utc'::text, now()), timezone('utc'::text, now()))
       returning id`,
      [p.user.id]
    )
    if (!row?.id) return { ok: false, error: "Erro ao criar rascunho" }
    return { ok: true, id: row.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao criar rascunho" }
  }
}

export async function createSimuladoDraft(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }
  try {
    const row = await queryOne<{ id: string }>(
      `insert into public.content_items
        (author_id, type, title, body_html, status, visibility, settings, created_at, updated_at)
       values ($1, 'simulado', 'Rascunho (simulado)', null, 'draft', 'private', '{}'::jsonb, timezone('utc'::text, now()), timezone('utc'::text, now()))
       returning id`,
      [p.user.id]
    )
    if (!row?.id) return { ok: false, error: "Erro ao criar rascunho" }
    return { ok: true, id: row.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao criar rascunho" }
  }
}

export async function createDicaDraft(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }
  try {
    const row = await queryOne<{ id: string }>(
      `insert into public.content_items
        (author_id, type, title, body_html, status, visibility, settings, created_at, updated_at)
       values ($1, 'dica', 'Rascunho (dica)', null, 'draft', 'private', '{}'::jsonb, timezone('utc'::text, now()), timezone('utc'::text, now()))
       returning id`,
      [p.user.id]
    )
    if (!row?.id) return { ok: false, error: "Erro ao criar rascunho" }
    return { ok: true, id: row.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao criar rascunho" }
  }
}

export type SaveExerciseDraftInput = {
  id: string
  title?: string
  bodyHtml?: string
  settings: ContentItemSettings
  /** Substitui settings.exam (pode ser null para limpar) */
  exam?: ActivityExamDefinition | null
}

export async function saveExerciseDraft(
  input: SaveExerciseDraftInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const row = await queryOne<{ id: string; settings: any; type: string }>(
    "select id, settings, type from public.content_items where id = $1 and author_id = $2 and type = 'exercise'",
    [input.id, p.user.id]
  )
  if (!row) return { ok: false, error: "Exercicio nao encontrado" }

  const current = asRecord(row.settings)
  const baseSettings: ContentItemSettings = {
    tags: input.settings.tags?.filter(Boolean) ?? [],
    disciplina: input.settings.disciplina?.trim() || undefined,
    nivel: input.settings.nivel?.trim() || undefined,
    coverUrl: input.settings.coverUrl ?? null,
    coverVideoUrl: null,
  }
  let merged: Record<string, unknown> = {
    ...current,
    ...baseSettings,
  }
  merged = mergeActivitySettings(merged, {
    exam: input.exam !== undefined ? input.exam : undefined,
  })

  const examOnly = parseExamFromSettings(merged)
  if (examOnly) {
    const verr = validateExamDefinition(examOnly)
    if (verr) return { ok: false, error: verr }
  }

  const patch: Record<string, unknown> = { settings: merged }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.bodyHtml !== undefined) {
    patch.body_html = sanitizeActivityHtml(input.bodyHtml.trim() || "") || null
  }

  try {
    await query(
      "update public.content_items set title = coalesce($1, title), body_html = coalesce($2, body_html), settings = $3::jsonb where id = $4 and author_id = $5 and type = 'exercise'",
      [
        input.title !== undefined ? input.title.trim() : null,
        input.bodyHtml !== undefined
          ? sanitizeActivityHtml(input.bodyHtml.trim() || "") || null
          : null,
        JSON.stringify(merged),
        input.id,
        p.user.id,
      ]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao salvar rascunho" }
  }
  revalidatePath("/dashboard/professor/criar")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export type SaveAssessmentDraftInput = SaveExerciseDraftInput & {
  dueAt?: string | null
  startsAt?: string | null
}

export async function saveAssessmentDraft(
  input: SaveAssessmentDraftInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const row = await queryOne<{ id: string; settings: any; type: string }>(
    "select id, settings, type from public.content_items where id = $1 and author_id = $2 and type = 'assessment'",
    [input.id, p.user.id]
  )
  if (!row) return { ok: false, error: "Avaliacao nao encontrada" }

  const current = asRecord(row.settings)
  const baseSettings: ContentItemSettings = {
    tags: input.settings.tags?.filter(Boolean) ?? [],
    disciplina: input.settings.disciplina?.trim() || undefined,
    nivel: input.settings.nivel?.trim() || undefined,
    coverUrl: input.settings.coverUrl ?? null,
    coverVideoUrl: null,
  }
  let merged: Record<string, unknown> = {
    ...current,
    ...baseSettings,
  }
  merged = mergeActivitySettings(merged, {
    exam: input.exam !== undefined ? input.exam : undefined,
  })
  if (input.dueAt !== undefined) merged.dueAt = input.dueAt
  if (input.startsAt !== undefined) merged.startsAt = input.startsAt

  const examOnly = parseExamFromSettings(merged)
  if (examOnly) {
    const verr = validateExamDefinition(examOnly)
    if (verr) return { ok: false, error: verr }
  }

  const patch: Record<string, unknown> = { settings: merged }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.bodyHtml !== undefined) {
    patch.body_html = sanitizeActivityHtml(input.bodyHtml.trim() || "") || null
  }

  try {
    await query(
      "update public.content_items set title = coalesce($1, title), body_html = coalesce($2, body_html), settings = $3::jsonb where id = $4 and author_id = $5 and type = 'assessment'",
      [
        input.title !== undefined ? input.title.trim() : null,
        input.bodyHtml !== undefined
          ? sanitizeActivityHtml(input.bodyHtml.trim() || "") || null
          : null,
        JSON.stringify(merged),
        input.id,
        p.user.id,
      ]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao salvar rascunho" }
  }
  revalidatePath("/dashboard/professor/criar")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export async function saveSimuladoDraft(
  input: SaveAssessmentDraftInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const row = await queryOne<{ id: string; settings: any; type: string }>(
    "select id, settings, type from public.content_items where id = $1 and author_id = $2 and type = 'simulado'",
    [input.id, p.user.id]
  )
  if (!row) return { ok: false, error: "Simulado nao encontrado" }

  const current = asRecord(row.settings)
  const baseSettings: ContentItemSettings = {
    tags: input.settings.tags?.filter(Boolean) ?? [],
    disciplina: input.settings.disciplina?.trim() || undefined,
    nivel: input.settings.nivel?.trim() || undefined,
    coverUrl: input.settings.coverUrl ?? null,
    coverVideoUrl: null,
  }
  let merged: Record<string, unknown> = {
    ...current,
    ...baseSettings,
  }
  merged = mergeActivitySettings(merged, {
    exam: input.exam !== undefined ? input.exam : undefined,
  })
  if (input.dueAt !== undefined) merged.dueAt = input.dueAt
  if (input.startsAt !== undefined) merged.startsAt = input.startsAt

  const examOnly = parseExamFromSettings(merged)
  if (examOnly) {
    const verr = validateExamDefinition(examOnly)
    if (verr) return { ok: false, error: verr }
  }

  const patch: Record<string, unknown> = { settings: merged }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.bodyHtml !== undefined) {
    patch.body_html = sanitizeActivityHtml(input.bodyHtml.trim() || "") || null
  }

  try {
    await query(
      "update public.content_items set title = coalesce($1, title), body_html = coalesce($2, body_html), settings = $3::jsonb where id = $4 and author_id = $5 and type = 'simulado'",
      [
        input.title !== undefined ? input.title.trim() : null,
        input.bodyHtml !== undefined
          ? sanitizeActivityHtml(input.bodyHtml.trim() || "") || null
          : null,
        JSON.stringify(merged),
        input.id,
        p.user.id,
      ]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao salvar rascunho" }
  }
  revalidatePath("/dashboard/professor/criar")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export type PublishExerciseInput = {
  id: string
  title: string
  bodyHtml: string
  visibility: ContentVisibility
  classroomIds?: string[]
  settings: ContentItemSettings
}

export async function publishExercise(
  input: PublishExerciseInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const existingRow = await queryOne<{ published_at: string | null; status: string; settings: any }>(
    "select published_at, status, settings from public.content_items where id = $1 and author_id = $2 and type = 'exercise'",
    [input.id, p.user.id]
  )
  if (!existingRow) return { ok: false, error: "Exercicio nao encontrado" }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  if (input.visibility === "classrooms") {
    const ids = input.classroomIds ?? []
    if (ids.length === 0) {
      return { ok: false, error: "Selecione ao menos uma turma" }
    }
    const ok = await assertOwnsAllClassrooms(p.user.id, ids).catch(() => false)
    if (!ok) return { ok: false, error: "Turma invalida" }
  }

  const bodyHtml = sanitizeActivityHtml(input.bodyHtml.trim() || "")
  const settingsMerged = mergeActivitySettings(
    {
      ...((existingRow.settings ?? {}) as Record<string, unknown>),
      tags: input.settings.tags?.filter(Boolean) ?? [],
      disciplina: input.settings.disciplina?.trim() || undefined,
      nivel: input.settings.nivel?.trim() || undefined,
      coverUrl: input.settings.coverUrl ?? null,
      coverVideoUrl: null,
    },
    { exam: input.settings.exam !== undefined ? input.settings.exam : undefined }
  )
  const exam = parseExamFromSettings(settingsMerged)
  if (!exam || exam.questions.length === 0) {
    return { ok: false, error: "Adicione ao menos uma questao" }
  }
  const verr = validateExamDefinition(exam)
  if (verr) return { ok: false, error: verr }

  const settings = settingsMerged as unknown as ContentItemSettings

  const publishedAt =
    existingRow.status === "published" && existingRow.published_at
      ? existingRow.published_at
      : new Date().toISOString()

  try {
    await query(
      `update public.content_items
       set title = $1, body_html = $2, status = 'published', visibility = $3, published_at = $4, settings = $5::jsonb
       where id = $6 and author_id = $7 and type = 'exercise'`,
      [title, bodyHtml || null, input.visibility, publishedAt, JSON.stringify(settings), input.id, p.user.id]
    )
    await replaceContentItemClassrooms(input.id, input.visibility === "classrooms" ? input.classroomIds : [])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao publicar exercicio" }
  }

  revalidatePath("/dashboard/aluno")
  revalidatePath("/dashboard/professor")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export type PublishAssessmentInput = PublishExerciseInput & {
  dueAt: string
  startsAt?: string | null
}

export async function publishAssessment(
  input: PublishAssessmentInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const existingRow = await queryOne<{ published_at: string | null; status: string; settings: any }>(
    "select published_at, status, settings from public.content_items where id = $1 and author_id = $2 and type = 'assessment'",
    [input.id, p.user.id]
  )
  if (!existingRow) return { ok: false, error: "Avaliacao nao encontrada" }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  const dueTrim = input.dueAt.trim()
  if (!dueTrim) {
    return { ok: false, error: "Informe a data e hora limite de entrega" }
  }
  const dueMs = new Date(dueTrim).getTime()
  if (Number.isNaN(dueMs)) {
    return { ok: false, error: "Data limite invalida" }
  }
  let startsIso: string | null = null
  if (input.startsAt != null && String(input.startsAt).trim()) {
    const s = String(input.startsAt).trim()
    const startMs = new Date(s).getTime()
    if (Number.isNaN(startMs)) {
      return { ok: false, error: "Data de abertura invalida" }
    }
    if (startMs > dueMs) {
      return { ok: false, error: "A abertura deve ser antes ou no limite de entrega" }
    }
    startsIso = new Date(s).toISOString()
  }

  if (input.visibility === "classrooms") {
    const ids = input.classroomIds ?? []
    if (ids.length === 0) {
      return { ok: false, error: "Selecione ao menos uma turma" }
    }
    const ok = await assertOwnsAllClassrooms(p.user.id, ids).catch(() => false)
    if (!ok) return { ok: false, error: "Turma invalida" }
  }

  const bodyHtml = sanitizeActivityHtml(input.bodyHtml.trim() || "")
  const prev = (existingRow.settings ?? {}) as Record<string, unknown>
  const settingsMerged = mergeActivitySettings(
    {
      ...prev,
      tags: input.settings.tags?.filter(Boolean) ?? [],
      disciplina: input.settings.disciplina?.trim() || undefined,
      nivel: input.settings.nivel?.trim() || undefined,
      coverUrl: input.settings.coverUrl ?? null,
      coverVideoUrl: null,
      dueAt: new Date(dueTrim).toISOString(),
      startsAt: startsIso,
      assessmentClosed: prev.assessmentClosed === true,
    },
    { exam: input.settings.exam !== undefined ? input.settings.exam : undefined }
  )
  const exam = parseExamFromSettings(settingsMerged)
  if (!exam || exam.questions.length === 0) {
    return { ok: false, error: "Adicione ao menos uma questao" }
  }
  const verr = validateExamDefinition(exam)
  if (verr) return { ok: false, error: verr }

  const settings = settingsMerged as unknown as ContentItemSettings

  const publishedAt =
    existingRow.status === "published" && existingRow.published_at
      ? existingRow.published_at
      : new Date().toISOString()

  try {
    await query(
      `update public.content_items
       set title = $1, body_html = $2, status = 'published', visibility = $3, published_at = $4, settings = $5::jsonb
       where id = $6 and author_id = $7 and type = 'assessment'`,
      [title, bodyHtml || null, input.visibility, publishedAt, JSON.stringify(settings), input.id, p.user.id]
    )
    await replaceContentItemClassrooms(input.id, input.visibility === "classrooms" ? input.classroomIds : [])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao publicar avaliacao" }
  }

  revalidatePath("/dashboard/aluno")
  revalidatePath("/dashboard/professor")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export async function publishSimulado(
  input: PublishAssessmentInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const existingRow = await queryOne<{ published_at: string | null; status: string; settings: any }>(
    "select published_at, status, settings from public.content_items where id = $1 and author_id = $2 and type = 'simulado'",
    [input.id, p.user.id]
  )
  if (!existingRow) return { ok: false, error: "Simulado nao encontrado" }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  const dueTrim = input.dueAt.trim()
  if (!dueTrim) {
    return { ok: false, error: "Informe a data e hora limite de entrega" }
  }
  const dueMs = new Date(dueTrim).getTime()
  if (Number.isNaN(dueMs)) {
    return { ok: false, error: "Data limite invalida" }
  }
  let startsIso: string | null = null
  if (input.startsAt != null && String(input.startsAt).trim()) {
    const s = String(input.startsAt).trim()
    const startMs = new Date(s).getTime()
    if (Number.isNaN(startMs)) {
      return { ok: false, error: "Data de abertura invalida" }
    }
    if (startMs > dueMs) {
      return { ok: false, error: "A abertura deve ser antes ou no limite de entrega" }
    }
    startsIso = new Date(s).toISOString()
  }

  if (input.visibility === "classrooms") {
    const ids = input.classroomIds ?? []
    if (ids.length === 0) {
      return { ok: false, error: "Selecione ao menos uma turma" }
    }
    const ok = await assertOwnsAllClassrooms(p.user.id, ids).catch(() => false)
    if (!ok) return { ok: false, error: "Turma invalida" }
  }

  const bodyHtml = sanitizeActivityHtml(input.bodyHtml.trim() || "")
  const prev = (existingRow.settings ?? {}) as Record<string, unknown>
  const settingsMerged = mergeActivitySettings(
    {
      ...prev,
      tags: input.settings.tags?.filter(Boolean) ?? [],
      disciplina: input.settings.disciplina?.trim() || undefined,
      nivel: input.settings.nivel?.trim() || undefined,
      coverUrl: input.settings.coverUrl ?? null,
      coverVideoUrl: null,
      dueAt: new Date(dueTrim).toISOString(),
      startsAt: startsIso,
      assessmentClosed: prev.assessmentClosed === true,
    },
    { exam: input.settings.exam !== undefined ? input.settings.exam : undefined }
  )
  const exam = parseExamFromSettings(settingsMerged)
  if (!exam || exam.questions.length === 0) {
    return { ok: false, error: "Adicione ao menos uma questao" }
  }
  const verr = validateExamDefinition(exam)
  if (verr) return { ok: false, error: verr }
  const derr = validateExamQuestionDisciplinas(exam)
  if (derr) return { ok: false, error: derr }

  const settings = settingsMerged as unknown as ContentItemSettings

  const publishedAt =
    existingRow.status === "published" && existingRow.published_at
      ? existingRow.published_at
      : new Date().toISOString()

  try {
    await query(
      `update public.content_items
       set title = $1, body_html = $2, status = 'published', visibility = $3, published_at = $4, settings = $5::jsonb
       where id = $6 and author_id = $7 and type = 'simulado'`,
      [title, bodyHtml || null, input.visibility, publishedAt, JSON.stringify(settings), input.id, p.user.id]
    )
    await replaceContentItemClassrooms(input.id, input.visibility === "classrooms" ? input.classroomIds : [])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao publicar simulado" }
  }

  revalidatePath("/dashboard/aluno")
  revalidatePath("/dashboard/professor")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export async function closeContentAssessment(
  contentItemId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const row = await queryOne<{ id: string; settings: any; status: string; type: string }>(
    "select id, settings, status, type from public.content_items where id = $1 and author_id = $2 and type = any($3::text[])",
    [contentItemId, p.user.id, ["assessment", "simulado"]]
  )
  if (!row) return { ok: false, error: "Conteudo nao encontrado" }
  if (row.status !== "published") {
    return { ok: false, error: "Publique o conteudo antes de encerrar" }
  }

  const merged = {
    ...asRecord(row.settings),
    assessmentClosed: true,
  }

  try {
    await query(
      "update public.content_items set settings = $1::jsonb where id = $2 and author_id = $3 and type = any($4::text[])",
      [JSON.stringify(merged), contentItemId, p.user.id, ["assessment", "simulado"]]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao encerrar avaliacao" }
  }
  revalidatePath("/dashboard/professor/criar")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${contentItemId}`)
  return { ok: true }
}

export type PublishArticleInput = {
  id: string
  title: string
  bodyHtml: string
  visibility: ContentVisibility
  /** Obrigatorio se visibility === 'classrooms' */
  classroomIds?: string[]
  settings: ContentItemSettings
}

export async function publishArticle(
  input: PublishArticleInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const okOwn = await assertOwnsArticle(input.id, p.user.id)
  if (!okOwn) return { ok: false, error: "Artigo nao encontrado" }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  if (input.visibility === "classrooms") {
    const ids = input.classroomIds ?? []
    if (ids.length === 0) {
      return { ok: false, error: "Selecione ao menos uma turma" }
    }
    const ok = await assertOwnsAllClassrooms(p.user.id, ids).catch(() => false)
    if (!ok) return { ok: false, error: "Turma invalida" }
  }

  const bodyHtml = sanitizeActivityHtml(input.bodyHtml.trim() || "")
  const settings: ContentItemSettings = {
    tags: input.settings.tags?.filter(Boolean) ?? [],
    disciplina: input.settings.disciplina?.trim() || undefined,
    nivel: input.settings.nivel?.trim() || undefined,
    coverUrl: input.settings.coverUrl ?? null,
    coverVideoUrl: input.settings.coverVideoUrl ?? null,
  }

  try {
    await query(
      `update public.content_items
       set title = $1, body_html = $2, status = 'verificando', visibility = $3, published_at = null, settings = $4::jsonb
       where id = $5 and author_id = $6 and type = 'article'`,
      [title, bodyHtml || null, input.visibility, JSON.stringify(settings), input.id, p.user.id]
    )
    await replaceContentItemClassrooms(input.id, input.visibility === "classrooms" ? input.classroomIds : [])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao publicar artigo" }
  }

  // Agente roda em background após resposta enviada ao cliente
  const itemId = input.id
  after(async () => {
    try {
      await runArticleReview(itemId)
    } catch (err) {
      console.error("[review] Erro no agente de revisao:", err)
    }
  })

  revalidatePath("/dashboard/professor")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export type SaveDicaDraftInput = {
  id: string
  title?: string
  bodyHtml?: string
  settings: ContentItemSettings
}

export async function saveDicaDraft(
  input: SaveDicaDraftInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const row = await queryOne<{ id: string; settings: any; type: string }>(
    "select id, settings, type from public.content_items where id = $1 and author_id = $2 and type = 'dica'",
    [input.id, p.user.id]
  )
  if (!row) return { ok: false, error: "Dica nao encontrada" }

  const current = asRecord(row.settings)
  const normalizedImgs =
    input.settings.dicaImageUrls != null
      ? input.settings.dicaImageUrls
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .slice(0, DICA_MAX_IMAGES)
      : null

  const nextVideo =
    input.settings.dicaVideoUrl !== undefined
      ? input.settings.dicaVideoUrl?.trim() || null
      : (typeof current.dicaVideoUrl === "string" ? current.dicaVideoUrl.trim() || null : null)

  const nextImages =
    input.settings.dicaImageUrls !== undefined
      ? normalizedImgs && normalizedImgs.length > 0
        ? normalizedImgs
        : null
      : Array.isArray(current.dicaImageUrls)
        ? (current.dicaImageUrls as string[])
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .slice(0, DICA_MAX_IMAGES)
        : null

  const merged: Record<string, unknown> = {
    ...current,
    tags: input.settings.tags?.filter(Boolean) ?? [],
    disciplina: input.settings.disciplina?.trim() || undefined,
    nivel: input.settings.nivel?.trim() || undefined,
    dicaVideoUrl: nextVideo,
    dicaImageUrls: nextImages,
  }

  const patch: Record<string, unknown> = { settings: merged }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.bodyHtml !== undefined) {
    patch.body_html =
      sanitizeActivityHtml(input.bodyHtml.trim().replace(/\n/g, "<br/>")) || null
  }

  try {
    await query(
      "update public.content_items set title = coalesce($1, title), body_html = coalesce($2, body_html), settings = $3::jsonb where id = $4 and author_id = $5 and type = 'dica'",
      [
        input.title !== undefined ? input.title.trim() : null,
        input.bodyHtml !== undefined
          ? sanitizeActivityHtml(input.bodyHtml.trim().replace(/\n/g, "<br/>")) || null
          : null,
        JSON.stringify(merged),
        input.id,
        p.user.id,
      ]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao salvar dica" }
  }
  revalidatePath("/dashboard/professor/criar")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export type PublishDicaInput = PublishArticleInput

export async function publishDica(
  input: PublishDicaInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const existingRow = await queryOne<{ published_at: string | null; status: string; settings: any }>(
    "select published_at, status, settings from public.content_items where id = $1 and author_id = $2 and type = 'dica'",
    [input.id, p.user.id]
  )
  if (!existingRow) return { ok: false, error: "Dica nao encontrada" }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  const bodyHtml = sanitizeActivityHtml(input.bodyHtml.trim().replace(/\n/g, "<br/>"))
  if (!bodyHtml?.trim()) {
    return { ok: false, error: "Escreva a descricao da dica" }
  }

  if (input.visibility === "classrooms") {
    const ids = input.classroomIds ?? []
    if (ids.length === 0) {
      return { ok: false, error: "Selecione ao menos uma turma" }
    }
    const ok = await assertOwnsAllClassrooms(p.user.id, ids).catch(() => false)
    if (!ok) return { ok: false, error: "Turma invalida" }
  }

  const imgs = input.settings.dicaImageUrls
  const normalizedImgs = Array.isArray(imgs)
    ? imgs
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, DICA_MAX_IMAGES)
    : []

  const settings: ContentItemSettings = {
    tags: input.settings.tags?.filter(Boolean) ?? [],
    disciplina: input.settings.disciplina?.trim() || undefined,
    nivel: input.settings.nivel?.trim() || undefined,
    coverUrl: null,
    coverVideoUrl: null,
    dicaVideoUrl: input.settings.dicaVideoUrl?.trim() || null,
    dicaImageUrls: normalizedImgs.length > 0 ? normalizedImgs : null,
  }

  const verr = validateDicaMediaForPublish(settings)
  if (verr) return { ok: false, error: verr }

  const publishedAt =
    existingRow.status === "published" && existingRow.published_at
      ? existingRow.published_at
      : new Date().toISOString()

  try {
    await query(
      `update public.content_items
       set title = $1, body_html = $2, status = 'published', visibility = $3, published_at = $4, settings = $5::jsonb
       where id = $6 and author_id = $7 and type = 'dica'`,
      [title, bodyHtml, input.visibility, publishedAt, JSON.stringify(settings), input.id, p.user.id]
    )
    await replaceContentItemClassrooms(input.id, input.visibility === "classrooms" ? input.classroomIds : [])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao publicar dica" }
  }

  const isFirstPublish = existingRow.status !== "published"
  if (isFirstPublish) {
    const teacherRow = await queryOne<{ full_name: string | null }>(
      "SELECT full_name FROM public.profiles WHERE id = $1",
      [p.user.id]
    )
    after(() =>
      notifyFollowersNewContent({
        teacherId: p.user.id,
        teacherName: teacherRow?.full_name?.trim() || "Professor",
        entityId: input.id,
        contentTypeLabel: "dica",
        title: title,
      }).catch(() => {})
    )
  }

  revalidatePath("/dashboard/aluno")
  revalidatePath("/dashboard/professor")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${input.id}`)
  return { ok: true }
}

export type ArticleForEdit = {
  id: string
  title: string
  body_html: string | null
  status: ContentItemStatus
  visibility: ContentVisibility
  settings: ContentItemSettings
  classroomIds: string[]
}

export async function getArticleForEdit(
  id: string
): Promise<{ ok: true; article: ArticleForEdit } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const row = await queryOne<Pick<ContentItemRow, "id" | "title" | "body_html" | "status" | "visibility" | "settings">>(
    "select id, title, body_html, status, visibility, settings from public.content_items where id = $1 and author_id = $2 and type = 'article'",
    [id, p.user.id]
  )
  if (!row) return { ok: false, error: "Artigo nao encontrado" }

  const cicRows = await query<{ classroom_id: string }>(
    "select classroom_id from public.content_item_classrooms where content_item_id = $1",
    [id]
  )

  const r = row

  return {
    ok: true,
    article: {
      id: r.id,
      title: r.title,
      body_html: r.body_html,
      status: r.status,
      visibility: r.visibility,
      settings: asRecord(r.settings) as ContentItemSettings,
      classroomIds: (cicRows ?? []).map((c) => c.classroom_id as string),
    },
  }
}

export type ExerciseForEdit = ArticleForEdit

export type AssessmentForEdit = ArticleForEdit & {
  dueAt: string | null
  startsAt: string | null
  assessmentClosed: boolean
}

export async function loadProfessorContentForEdit(
  id: string
): Promise<
  | { ok: true; kind: "article"; article: ArticleForEdit }
  | { ok: true; kind: "exercise"; exercise: ExerciseForEdit }
  | { ok: true; kind: "assessment"; assessment: AssessmentForEdit }
  | { ok: true; kind: "simulado"; simulado: AssessmentForEdit }
  | { ok: true; kind: "dica"; dica: ArticleForEdit }
  | { ok: false; error: string }
> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const row = await queryOne<Pick<ContentItemRow, "id" | "type" | "title" | "body_html" | "status" | "visibility" | "settings">>(
    "select id, type, title, body_html, status, visibility, settings from public.content_items where id = $1 and author_id = $2",
    [id, p.user.id]
  )
  if (!row) return { ok: false, error: "Conteudo nao encontrado" }

  const itemType = row.type as ContentItemType
  if (
    itemType !== "article" &&
    itemType !== "exercise" &&
    itemType !== "assessment" &&
    itemType !== "simulado" &&
    itemType !== "dica"
  ) {
    return { ok: false, error: "Conteudo nao encontrado" }
  }

  const cicRows = await query<{ classroom_id: string }>(
    "select classroom_id from public.content_item_classrooms where content_item_id = $1",
    [id]
  )

  const classroomIds = (cicRows ?? []).map((c) => c.classroom_id as string)
  const r = row as any
  const base: ArticleForEdit = {
    id: r.id,
    title: r.title,
    body_html: r.body_html,
    status: r.status,
    visibility: r.visibility,
    settings: asRecord(r.settings) as ContentItemSettings,
    classroomIds,
  }

  if (itemType === "article") {
    return { ok: true, kind: "article", article: base }
  }
  if (itemType === "dica") {
    return { ok: true, kind: "dica", dica: base }
  }
  if (itemType === "exercise") {
    return { ok: true, kind: "exercise", exercise: base }
  }
  const st = asRecord(r.settings)
  const timed: AssessmentForEdit = {
    ...base,
    dueAt: typeof st.dueAt === "string" ? st.dueAt : null,
    startsAt: typeof st.startsAt === "string" ? st.startsAt : null,
    assessmentClosed: st.assessmentClosed === true,
  }
  if (itemType === "simulado") {
    return { ok: true, kind: "simulado", simulado: timed }
  }
  return {
    ok: true,
    kind: "assessment",
    assessment: timed,
  }
}

export async function deleteContentItem(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  try {
    await query("delete from public.content_items where id = $1 and author_id = $2", [id, p.user.id])
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao excluir" }
  }

  revalidatePath("/dashboard/aluno")
  revalidatePath("/dashboard/professor")
  revalidatePath("/dashboard/professor/conteudos")
  revalidatePath(`/conteudo/${id}`)
  return { ok: true }
}

export async function uploadTrixArticleImage(
  contentItemId: string,
  formData: FormData
): Promise<
  { ok: true; displayUrl: string; pathname: string } | { ok: false; error: string }
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const owns = await assertOwnsArticle(contentItemId, p.user.id)
  if (!owns) return { ok: false, error: "Artigo nao encontrado" }

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
    (!file.type?.trim() && /\.(jpe?g|png|gif|webp)$/i.test(file.name))
  if (!isImage) {
    return { ok: false, error: "Apenas imagens JPEG, PNG, GIF ou WebP" }
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `articles/${contentItemId}/trix/${randomUUID()}-${safe}`
  const contentType = effectiveContentType(file)
  try {
    const blob = await put(pathname, file, {
      access: "private",
      token,
      contentType,
    })
    const displayUrl = `/api/article-attachment?pathname=${encodeURIComponent(blob.pathname)}&filename=${encodeURIComponent(file.name)}`
    return { ok: true, displayUrl, pathname: blob.pathname }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }
}

/** Capa do artigo (settings.coverUrl); mesmo padrão de URL que imagens do Trix. */
export async function uploadArticleCoverImage(
  contentItemId: string,
  formData: FormData
): Promise<
  { ok: true; displayUrl: string; pathname: string } | { ok: false; error: string }
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const owns = await assertOwnsArticle(contentItemId, p.user.id)
  if (!owns) return { ok: false, error: "Artigo nao encontrado" }

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
    (!file.type?.trim() && /\.(jpe?g|png|gif|webp)$/i.test(file.name))
  if (!isImage) {
    return { ok: false, error: "Apenas imagens JPEG, PNG, GIF ou WebP" }
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `articles/${contentItemId}/cover/${randomUUID()}-${safe}`
  const contentType = effectiveContentType(file)
  try {
    const blob = await put(pathname, file, {
      access: "private",
      token,
      contentType,
    })
    const displayUrl = `/api/article-attachment?pathname=${encodeURIComponent(blob.pathname)}&filename=${encodeURIComponent(file.name)}`
    return { ok: true, displayUrl, pathname: blob.pathname }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }
}

/** Imagem da galeria da dica (settings.dicaImageUrls; ate 4). */
export async function uploadDicaImage(
  contentItemId: string,
  formData: FormData
): Promise<
  { ok: true; displayUrl: string; pathname: string } | { ok: false; error: string }
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: "Nao autenticado" }

  const owns = await assertOwnsArticle(contentItemId, p.user.id)
  if (!owns) return { ok: false, error: "Conteudo nao encontrado" }

  const ci = await queryOne<{ type: string }>(
    "select type from public.content_items where id = $1 and author_id = $2",
    [contentItemId, p.user.id]
  )
  if (ci?.type !== "dica") {
    return { ok: false, error: "Conteudo nao encontrado" }
  }

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
    (!file.type?.trim() && /\.(jpe?g|png|gif|webp)$/i.test(file.name))
  if (!isImage) {
    return { ok: false, error: "Apenas imagens JPEG, PNG, GIF ou WebP" }
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `articles/${contentItemId}/dica/${randomUUID()}-${safe}`
  const contentType = effectiveContentType(file)
  try {
    const blob = await put(pathname, file, {
      access: "private",
      token,
      contentType,
    })
    const displayUrl = `/api/article-attachment?pathname=${encodeURIComponent(blob.pathname)}&filename=${encodeURIComponent(file.name)}`
    return { ok: true, displayUrl, pathname: blob.pathname }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }
}

/** Capa em video (settings.coverVideoUrl); exclusiva com imagem de capa. */
export async function uploadArticleCoverVideo(
  contentItemId: string,
  formData: FormData
): Promise<
  { ok: true; displayUrl: string; pathname: string } | { ok: false; error: string }
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const p = await assertProfessor()
  if (!p.user) return { ok: false, error: p.error ?? "Nao autenticado" }

  const owns = await assertOwnsArticle(contentItemId, p.user.id)
  if (!owns) return { ok: false, error: "Artigo nao encontrado" }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Nenhum arquivo" }
  }
  if (file.size > COVER_VIDEO_MAX_BYTES) {
    return {
      ok: false,
      error: `Video muito grande (max ${COVER_VIDEO_MAX_BYTES / 1024 / 1024} MB)`,
    }
  }
  if (!isArticleCoverVideoFile(file)) {
    return { ok: false, error: "Apenas video MP4, WebM ou MOV" }
  }

  const safe = safeUploadFilename(file.name)
  const pathname = `articles/${contentItemId}/cover/${randomUUID()}-${safe}`
  const contentType = effectiveVideoContentType(file)
  try {
    const blob = await put(pathname, file, {
      access: "private",
      token,
      contentType,
    })
    const displayUrl = `/api/article-attachment?pathname=${encodeURIComponent(blob.pathname)}&filename=${encodeURIComponent(file.name)}`
    return { ok: true, displayUrl, pathname: blob.pathname }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }
}

export type FeedContentItem = ContentItemRow & {
  author: { full_name: string | null; avatar_url: string | null }
}

/** @deprecated Use FeedContentItem */
export type FeedArticle = FeedContentItem

export async function getFeedArticlesForCurrentUser(limit = 20): Promise<FeedContentItem[]> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return []

  let articles: any[] = []
  try {
    articles = await query<any>(
      "select * from public.feed_content_items_for_user($1, $2)",
      [user.id, limit]
    )
  } catch {
    return []
  }
  if (articles.length === 0) return []

  const authorIds = [
    ...new Set(
      articles.map((a) => a.author_id).filter((id: any) => typeof id === "string" && id.length > 0)
    ),
  ]
  let profiles: { id: string; full_name: string | null; avatar_url: string | null }[] = []
  if (authorIds.length > 0) {
    profiles = await query<{ id: string; full_name: string | null; avatar_url: string | null }>(
      "select id, full_name, avatar_url from public.profiles where id = any($1::uuid[])",
      [authorIds]
    )
  }
  const byId = new Map(profiles.map((p) => [p.id, p]))

  return articles
    .filter((a) => a && (a.type === "article" || a.type === "exercise" || a.type === "assessment" || a.type === "simulado" || a.type === "dica"))
    .map((a) => ({
      ...(a as ContentItemRow),
      settings: asRecord((a as any).settings) as ContentItemSettings,
      author: {
        full_name: byId.get((a as any).author_id)?.full_name ?? null,
        avatar_url: byId.get((a as any).author_id)?.avatar_url ?? null,
      },
    }))
}

/** Conteúdos que o usuário salvou (para a página "Salvos"). */
export async function listMySavedContent(limit = 50): Promise<FeedContentItem[]> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return []

  let rows: any[] = []
  try {
    rows = await query<any>(
      `select ci.*
       from public.content_items ci
       join public.content_saves cs on cs.content_item_id = ci.id
       where cs.user_id = $1 and ci.status = 'published'
       order by cs.created_at desc
       limit $2`,
      [user.id, Math.max(1, Math.min(limit, 100))]
    )
  } catch {
    return []
  }
  if (rows.length === 0) return []

  const authorIds = [
    ...new Set(rows.map((a) => a.author_id).filter((id: any) => typeof id === "string" && id.length > 0)),
  ]
  let profiles: { id: string; full_name: string | null; avatar_url: string | null }[] = []
  if (authorIds.length > 0) {
    profiles = await query<{ id: string; full_name: string | null; avatar_url: string | null }>(
      "select id, full_name, avatar_url from public.profiles where id = any($1::uuid[])",
      [authorIds]
    )
  }
  const byId = new Map(profiles.map((p) => [p.id, p]))

  return rows.map((a) => ({
    ...(a as ContentItemRow),
    settings: asRecord((a as any).settings) as ContentItemSettings,
    author: {
      full_name: byId.get((a as any).author_id)?.full_name ?? null,
      avatar_url: byId.get((a as any).author_id)?.avatar_url ?? null,
    },
  }))
}

export async function getMyLikesForContentIds(
  contentIds: string[]
): Promise<Set<string>> {
  if (contentIds.length === 0) return new Set()
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return new Set()

  const rows = await query<{ content_item_id: string }>(
    "select content_item_id from public.content_reactions where user_id = $1 and reaction_type = 'like' and content_item_id = any($2::uuid[])",
    [user.id, contentIds]
  ).catch(() => [])

  return new Set(rows.map((r) => r.content_item_id))
}

async function canViewContentItem(
  contentItemId: string,
  userId: string | null
): Promise<boolean> {
  const row = await queryOne<{ can_view: boolean }>(
    "select public.user_can_view_content_item($1::uuid, $2::uuid) as can_view",
    [contentItemId, userId]
  ).catch(() => null)
  return row?.can_view === true
}

export type ContentComment = {
  id: string
  content_item_id: string
  user_id: string
  body: string
  parent_id: string | null
  created_at: string
  updated_at: string
  author: {
    full_name: string | null
    avatar_url: string | null
  }
  replies?: ContentComment[]
}

type CommentRow = {
  id: string
  content_item_id: string
  user_id: string
  body: string
  parent_id: string | null
  created_at: string
  updated_at: string
  full_name: string | null
  avatar_url: string | null
}

function mapComment(row: CommentRow): ContentComment {
  return {
    id: row.id,
    content_item_id: row.content_item_id,
    user_id: row.user_id,
    body: row.body,
    parent_id: row.parent_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: {
      full_name: row.full_name,
      avatar_url: row.avatar_url,
    },
  }
}

export async function listContentComments(
  contentItemId: string
): Promise<
  { ok: true; comments: ContentComment[]; viewerUserId: string | null } | { ok: false; error: string }
> {
  const user = await getAuthedUser()
  const canView = await canViewContentItem(contentItemId, user?.id ?? null)
  if (!canView) return { ok: false, error: "Conteudo nao encontrado" }

  const rows = await query<CommentRow>(
    `select
       cc.id, cc.content_item_id, cc.user_id, cc.body, cc.parent_id, cc.created_at, cc.updated_at,
       p.full_name, p.avatar_url
     from public.content_comments cc
     left join public.content_comments parent on parent.id = cc.parent_id
     left join public.profiles p on p.id = cc.user_id
     where cc.content_item_id = $1
     order by
       coalesce(parent.created_at, cc.created_at) asc,
       coalesce(cc.parent_id, cc.id) asc,
       case when cc.parent_id is null then 0 else 1 end asc,
       cc.created_at asc`,
    [contentItemId]
  ).catch(() => [])

  const roots: ContentComment[] = []
  const byId = new Map<string, ContentComment>()
  for (const row of rows) {
    const comment = mapComment(row)
    byId.set(comment.id, comment)
    if (!comment.parent_id) {
      comment.replies = []
      roots.push(comment)
    }
  }
  for (const row of rows) {
    if (!row.parent_id) continue
    const parent = byId.get(row.parent_id)
    if (!parent || parent.parent_id) continue
    parent.replies ??= []
    parent.replies.push(mapComment(row))
  }

  return {
    ok: true,
    comments: roots,
    viewerUserId: user?.id ?? null,
  }
}

export async function listContentCommentPreviews(
  contentItemIds: string[],
  perContentLimit = 2
): Promise<Record<string, ContentComment[]>> {
  const user = await getAuthedUser()
  const ids = [
    ...new Set(
      contentItemIds.filter((id) => typeof id === "string" && id.trim().length > 0)
    ),
  ]
  if (ids.length === 0) return {}

  const limit = Math.max(1, Math.min(perContentLimit, 5))
  const rows = await query<CommentRow & { rn: number }>(
    `with ranked as (
       select
         cc.id, cc.content_item_id, cc.user_id, cc.body, cc.parent_id, cc.created_at, cc.updated_at,
         p.full_name, p.avatar_url,
         row_number() over (
           partition by cc.content_item_id
           order by cc.created_at desc, cc.id desc
         ) as rn
       from public.content_comments cc
       left join public.profiles p on p.id = cc.user_id
       where cc.content_item_id = any($1::uuid[])
         and cc.parent_id is null
         and public.user_can_view_content_item(cc.content_item_id, $2::uuid)
     )
     select *
     from ranked
     where rn <= $3
     order by content_item_id asc, created_at asc`,
    [ids, user?.id ?? null, limit]
  ).catch(() => [])

  const grouped: Record<string, ContentComment[]> = {}
  for (const row of rows) {
    grouped[row.content_item_id] ??= []
    grouped[row.content_item_id].push(mapComment(row))
  }
  return grouped
}

export async function createContentComment(
  contentItemId: string,
  body: string,
  parentCommentId?: string | null
): Promise<
  | { ok: true; comment: ContentComment; commentCount: number }
  | { ok: false; error: string }
> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const cleanBody = body.trim()
  if (!cleanBody) return { ok: false, error: "Escreva um comentario" }
  if (cleanBody.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Comentario muito longo (max ${COMMENT_MAX_LENGTH} caracteres)` }
  }

  const canView = await canViewContentItem(contentItemId, user.id)
  if (!canView) return { ok: false, error: "Conteudo nao encontrado" }

  const parentId = parentCommentId?.trim() || null
  if (parentId) {
    const parent = await queryOne<{ id: string; parent_id: string | null }>(
      "select id, parent_id from public.content_comments where id = $1 and content_item_id = $2",
      [parentId, contentItemId]
    )
    if (!parent) return { ok: false, error: "Comentario nao encontrado" }
    if (parent.parent_id) {
      return { ok: false, error: "Nao e possivel responder uma resposta" }
    }
  }

  try {
    const row = await queryOne<CommentRow>(
      `with inserted as (
         insert into public.content_comments (content_item_id, user_id, body, parent_id)
         values ($1, $2, $3, $4)
         returning id, content_item_id, user_id, body, parent_id, created_at, updated_at
       )
       select inserted.*, p.full_name, p.avatar_url
       from inserted
       left join public.profiles p on p.id = inserted.user_id`,
      [contentItemId, user.id, cleanBody, parentId]
    )
    if (!row) return { ok: false, error: "Erro ao comentar" }

    const countRow = await queryOne<{ comment_count: number }>(
      "select comment_count from public.content_items where id = $1",
      [contentItemId]
    )

    revalidatePath("/dashboard/aluno")
    revalidatePath("/dashboard/professor")
    revalidatePath("/dashboard/professor/conteudos")
    revalidatePath(`/conteudo/${contentItemId}`)

    return {
      ok: true,
      comment: mapComment(row),
      commentCount: countRow?.comment_count ?? 0,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao comentar" }
  }
}

export async function updateContentComment(
  commentId: string,
  body: string
): Promise<
  | { ok: true; comment: ContentComment }
  | { ok: false; error: string }
> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const cleanBody = body.trim()
  if (!cleanBody) return { ok: false, error: "Escreva um comentario" }
  if (cleanBody.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Comentario muito longo (max ${COMMENT_MAX_LENGTH} caracteres)` }
  }

  try {
    const row = await queryOne<CommentRow>(
      `with updated as (
         update public.content_comments
         set body = $1
         where id = $2 and user_id = $3
         returning id, content_item_id, user_id, body, parent_id, created_at, updated_at
       )
       select updated.*, p.full_name, p.avatar_url
       from updated
       left join public.profiles p on p.id = updated.user_id`,
      [cleanBody, commentId, user.id]
    )
    if (!row) return { ok: false, error: "Comentario nao encontrado" }

    revalidatePath(`/conteudo/${row.content_item_id}`)
    return { ok: true, comment: mapComment(row) }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao editar comentario" }
  }
}

export async function deleteContentComment(
  commentId: string
): Promise<
  | { ok: true; commentId: string; contentItemId: string; commentCount: number }
  | { ok: false; error: string }
> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  try {
    const deleted = await queryOne<{ id: string; content_item_id: string }>(
      `delete from public.content_comments
       where id = $1 and user_id = $2
       returning id, content_item_id`,
      [commentId, user.id]
    )
    if (!deleted) return { ok: false, error: "Comentario nao encontrado" }

    const countRow = await queryOne<{ comment_count: number }>(
      "select comment_count from public.content_items where id = $1",
      [deleted.content_item_id]
    )

    revalidatePath("/dashboard/aluno")
    revalidatePath("/dashboard/professor")
    revalidatePath("/dashboard/professor/conteudos")
    revalidatePath(`/conteudo/${deleted.content_item_id}`)

    return {
      ok: true,
      commentId: deleted.id,
      contentItemId: deleted.content_item_id,
      commentCount: countRow?.comment_count ?? 0,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao excluir comentario" }
  }
}

export async function toggleContentLike(
  contentItemId: string
): Promise<
  | { ok: true; liked: boolean; likeCount: number }
  | { ok: false; error: string }
> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const canView = await canViewContentItem(contentItemId, user.id)
  if (!canView) return { ok: false, error: "Conteudo nao encontrado" }

  const existing = await queryOne<{ id: string }>(
    "select id from public.content_reactions where content_item_id = $1 and user_id = $2 and reaction_type = 'like'",
    [contentItemId, user.id]
  )

  try {
    if (existing) {
      await query("delete from public.content_reactions where id = $1", [existing.id])
    } else {
      await query(
        "insert into public.content_reactions (content_item_id, user_id, reaction_type) values ($1, $2, 'like') on conflict do nothing",
        [contentItemId, user.id]
      )
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao reagir" }
  }

  const row = await queryOne<{ like_count: number }>(
    "select like_count from public.content_items where id = $1",
    [contentItemId]
  )

  revalidatePath("/dashboard/aluno")
  revalidatePath(`/conteudo/${contentItemId}`)

  return {
    ok: true,
    liked: !existing,
    likeCount: row?.like_count ?? 0,
  }
}

export async function getMySavesForContentIds(
  contentIds: string[]
): Promise<Set<string>> {
  if (contentIds.length === 0) return new Set()
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return new Set()

  const rows = await query<{ content_item_id: string }>(
    "select content_item_id from public.content_saves where user_id = $1 and content_item_id = any($2::uuid[])",
    [user.id, contentIds]
  ).catch(() => [])

  return new Set(rows.map((r) => r.content_item_id))
}

export async function toggleContentSave(
  contentItemId: string
): Promise<
  | { ok: true; saved: boolean; saveCount: number }
  | { ok: false; error: string }
> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const canView = await canViewContentItem(contentItemId, user.id)
  if (!canView) return { ok: false, error: "Conteudo nao encontrado" }

  const existing = await queryOne<{ id: string }>(
    "select id from public.content_saves where content_item_id = $1 and user_id = $2",
    [contentItemId, user.id]
  )

  try {
    if (existing) {
      await query("delete from public.content_saves where id = $1", [existing.id])
    } else {
      await query(
        "insert into public.content_saves (content_item_id, user_id) values ($1, $2) on conflict do nothing",
        [contentItemId, user.id]
      )
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao salvar" }
  }

  const row = await queryOne<{ save_count: number }>(
    "select save_count from public.content_items where id = $1",
    [contentItemId]
  )

  revalidatePath("/dashboard/aluno")
  revalidatePath(`/conteudo/${contentItemId}`)

  return { ok: true, saved: !existing, saveCount: row?.save_count ?? 0 }
}

export async function getProfessorViewStats(): Promise<{
  totalViews: number
  totalPublications: number
  totalLikes: number
}> {
  const p = await assertProfessor()
  if (!p.user) return { totalViews: 0, totalPublications: 0, totalLikes: 0 }

  const row = await queryOne<{
    total_views: string
    total_publications: string
    total_likes: string
  }>(
    `select
       coalesce(sum(view_count), 0) as total_views,
       count(*) filter (where status = 'published') as total_publications,
       coalesce(sum(like_count), 0) as total_likes
     from public.content_items
     where author_id = $1`,
    [p.user.id]
  ).catch(() => null)

  return {
    totalViews: Number(row?.total_views ?? 0),
    totalPublications: Number(row?.total_publications ?? 0),
    totalLikes: Number(row?.total_likes ?? 0),
  }
}

export async function recordContentView(
  contentItemId: string
): Promise<{ ok: true; viewCount: number } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const canView = await canViewContentItem(contentItemId, user.id)
  if (!canView) return { ok: false, error: "Conteudo nao encontrado" }

  const existing = await queryOne<{ id: string }>(
    `select id from public.content_view_events
     where content_item_id = $1
       and user_id = $2
       and created_at > now() - interval '24 hours'`,
    [contentItemId, user.id]
  ).catch(() => null)

  if (!existing) {
    await query(
      "insert into public.content_view_events (content_item_id, user_id) values ($1, $2)",
      [contentItemId, user.id]
    ).catch(() => {})
  }

  const row = await queryOne<{ view_count: number }>(
    "select view_count from public.content_items where id = $1",
    [contentItemId]
  )

  return { ok: true, viewCount: row?.view_count ?? 0 }
}

export async function recordContentShare(
  contentItemId: string,
  method: ShareMethod
): Promise<{ ok: true; shareCount: number } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)

  const canView = await canViewContentItem(contentItemId, user?.id ?? null)
  if (!canView) return { ok: false, error: "Conteudo nao encontrado" }

  try {
    await query(
      "insert into public.content_share_events (content_item_id, user_id, share_method) values ($1, $2, $3)",
      [contentItemId, user?.id ?? null, method]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao registrar compartilhamento" }
  }

  const row = await queryOne<{ share_count: number }>(
    "select share_count from public.content_items where id = $1",
    [contentItemId]
  )

  revalidatePath("/dashboard/aluno")
  revalidatePath(`/conteudo/${contentItemId}`)

  return { ok: true, shareCount: row?.share_count ?? 0 }
}

export async function getContentItemById(
  id: string
): Promise<
  | {
      ok: true
      item: ContentItemRow
      author: { full_name: string | null; avatar_url: string | null }
    }
  | { ok: false; error: string }
> {
  // RLS e inerte (app_user e superuser/BYPASSRLS): a autorizacao acontece AQUI.
  // canViewContentItem espelha user_can_view_content_item — autor ve rascunho/privado,
  // publicado/publico e liberado, conteudo de turma exige matricula.
  const user = await getAuthedUser()
  const canView = await canViewContentItem(id, user?.id ?? null)
  if (!canView) return { ok: false, error: "Conteudo nao encontrado" }

  const item = await queryOne<ContentItemRow>(
    "select * from public.content_items where id = $1",
    [id]
  )
  if (!item) return { ok: false, error: "Conteudo nao encontrado" }

  const author = await queryOne<{ full_name: string | null; avatar_url: string | null }>(
    "select full_name, avatar_url from public.profiles where id = $1",
    [item.author_id]
  )

  // Nunca expor o gabarito (correctIndex) a quem nao e o autor do conteudo.
  let safeSettings = asRecord((item as any).settings) as ContentItemSettings
  const isExamLike =
    item.type === "exercise" || item.type === "assessment" || item.type === "simulado"
  if (isExamLike && user?.id !== item.author_id) {
    const examDef = parseExamFromSettings(safeSettings as Record<string, unknown>)
    if (examDef) {
      safeSettings = {
        ...safeSettings,
        exam: toPublicExam(examDef) as unknown as ContentItemSettings["exam"],
      }
    }
  }

  return {
    ok: true,
    item: { ...item, settings: safeSettings },
    author: {
      full_name: author?.full_name ?? null,
      avatar_url: author?.avatar_url ?? null,
    },
  }
}
