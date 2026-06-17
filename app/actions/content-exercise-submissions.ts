"use server"

import { revalidatePath } from "next/cache"
import { requireAuthedUser } from "@/lib/auth/user"
import { query, queryOne } from "@/lib/db/query"
import { createNotification } from "@/lib/notifications/event"
import {
  type ActivityExamDefinition,
  type ActivityExamPublic,
  computeMcqScore,
  parseExamFromSettings,
  sanitizeOpenText,
  sumOpenScores,
  toPublicExam,
  validateAnswersForSubmit,
  type StudentExamAnswers,
  validateExamDefinition,
} from "@/lib/activities/exam"
import { parseAssessmentSettings } from "@/lib/content/assessment-settings"

function isExamLikeContentType(t: string): boolean {
  return t === "exercise" || t === "assessment" || t === "simulado"
}

function isTimedExamContentType(t: string): boolean {
  return t === "assessment" || t === "simulado"
}

/** Rascunho/envio: bloqueia fora da janela ou se encerrada (nao aplica se ja enviado — tratar antes). */
function assertAssessmentStudentWriteAllowed(
  settings: Record<string, unknown>
): string | null {
  const p = parseAssessmentSettings(settings)
  if (p.assessmentClosed) return "Avaliacao encerrada pelo professor."
  const now = Date.now()
  if (p.startsAt) {
    const t = new Date(p.startsAt).getTime()
    if (!Number.isNaN(t) && t > now) return "A avaliacao ainda nao esta aberta."
  }
  if (p.dueAt) {
    const t = new Date(p.dueAt).getTime()
    if (!Number.isNaN(t) && t < now) return "O prazo de entrega encerrou."
  }
  return null
}

export type ContentExerciseSubmissionRow = {
  id: string
  content_item_id: string
  student_id: string
  status: "rascunho" | "enviado"
  answers: StudentExamAnswers
  score_mcq: number
  open_scores: Record<string, number>
  score_total: number | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

function parseOpenScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number" && !Number.isNaN(v) && v >= 0) out[k] = v
  }
  return out
}

function mapRow(data: Record<string, unknown>): ContentExerciseSubmissionRow {
  return {
    id: data.id as string,
    content_item_id: data.content_item_id as string,
    student_id: data.student_id as string,
    status: data.status as "rascunho" | "enviado",
    answers: (data.answers && typeof data.answers === "object"
      ? (data.answers as StudentExamAnswers)
      : {}) as StudentExamAnswers,
    score_mcq: Number(data.score_mcq ?? 0),
    open_scores: parseOpenScores(data.open_scores),
    score_total:
      data.score_total === null || data.score_total === undefined
        ? null
        : Number(data.score_total),
    submitted_at:
      typeof data.submitted_at === "string" ? data.submitted_at : null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  }
}

function revalidateContentExercisePaths(contentItemId: string) {
  revalidatePath(`/conteudo/${contentItemId}`)
  revalidatePath("/dashboard/aluno")
  revalidatePath("/dashboard/professor/conteudos")
}

/** Prova sem gabarito (aluno com acesso ao conteudo). */
export async function getExamForContentExercise(
  contentItemId: string
): Promise<{ ok: true; exam: ActivityExamPublic } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  type ItemRow = {
    settings: Record<string, unknown>
    status: string
    type: string
    author_id: string
  }
  const row = await queryOne<ItemRow>(
    "select settings, status, type, author_id from public.content_items where id = $1",
    [contentItemId]
  )

  if (!row || !isExamLikeContentType(row.type)) {
    return { ok: false, error: "Conteudo nao encontrado" }
  }
  if (row.status !== "published") {
    return { ok: false, error: "Conteudo indisponivel" }
  }
  if (row.author_id === user.id) {
    return { ok: false, error: "Use a visualizacao do autor" }
  }

  if (isTimedExamContentType(row.type)) {
    const sub = await queryOne<{ status: string }>(
      "select status from public.content_exercise_submissions where content_item_id = $1 and student_id = $2",
      [contentItemId, user.id]
    )
    if (sub?.status !== "enviado") {
      const settings = row.settings as Record<string, unknown>
      const p = parseAssessmentSettings(settings)
      if (p.assessmentClosed) {
        return { ok: false, error: "Avaliacao encerrada pelo professor." }
      }
      const now = Date.now()
      if (p.startsAt) {
        const t = new Date(p.startsAt).getTime()
        if (!Number.isNaN(t) && t > now) {
          return { ok: false, error: "A avaliacao ainda nao esta aberta." }
        }
      }
      if (p.dueAt) {
        const t = new Date(p.dueAt).getTime()
        if (!Number.isNaN(t) && t < now) {
          return { ok: false, error: "O prazo de entrega encerrou." }
        }
      }
    }
  }

  const exam = parseExamFromSettings(row.settings as Record<string, unknown>)
  if (!exam) return { ok: false, error: "Este conteudo nao tem questoes" }
  const err = validateExamDefinition(exam)
  if (err) return { ok: false, error: err }
  return { ok: true, exam: toPublicExam(exam) }
}

export async function getMyContentExerciseSubmission(
  contentItemId: string
): Promise<{
  submission: ContentExerciseSubmissionRow | null
  error: string | null
}> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { submission: null, error: "Nao autenticado" }

  try {
    const data = await queryOne<Record<string, unknown>>(
      "select * from public.content_exercise_submissions where content_item_id = $1 and student_id = $2",
      [contentItemId, user.id]
    )
    if (!data) return { submission: null, error: null }
    return { submission: mapRow(data), error: null }
  } catch (e: any) {
    return { submission: null, error: "Erro" }
  }
}

export async function saveContentExerciseDraft(
  contentItemId: string,
  answers: StudentExamAnswers
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  type ItemRow = {
    id: string
    status: string
    settings: Record<string, unknown>
    type: string
    author_id: string
  }

  const item = await queryOne<ItemRow>(
    "select id, status, settings, type, author_id from public.content_items where id = $1",
    [contentItemId]
  )

  if (!item) return { ok: false, error: "Conteudo nao encontrado" }
  if (!isExamLikeContentType(item.type)) {
    return { ok: false, error: "Conteudo nao encontrado" }
  }
  if (item.status !== "published") {
    return { ok: false, error: "Conteudo indisponivel" }
  }
  if (item.author_id === user.id) {
    return { ok: false, error: "Autor nao envia resposta aqui" }
  }

  const exam = parseExamFromSettings(item.settings as Record<string, unknown>)
  if (!exam) return { ok: false, error: "Sem questoes neste conteudo" }

  const sanitized: StudentExamAnswers = {}
  for (const q of exam.questions) {
    const a = answers[q.id]
    if (!a) continue
    if (q.type === "mcq" && a.type === "mcq") {
      sanitized[q.id] = {
        type: "mcq",
        choiceIndex: Math.max(0, Math.floor(a.choiceIndex)),
      }
    }
    if (q.type === "open" && a.type === "open") {
      sanitized[q.id] = { type: "open", text: sanitizeOpenText(a.text) }
    }
  }

  const existing = await queryOne<{ id: string; status: string }>(
    "select id, status from public.content_exercise_submissions where content_item_id = $1 and student_id = $2",
    [contentItemId, user.id]
  )

  if (existing?.status === "enviado") {
    return { ok: false, error: "Prova ja enviada" }
  }

  if (isTimedExamContentType(item.type)) {
    const werr = assertAssessmentStudentWriteAllowed(
      item.settings as Record<string, unknown>
    )
    if (werr) return { ok: false, error: werr }
  }

  if (existing) {
    try {
      await query(
        `update public.content_exercise_submissions
         set answers = $3::jsonb
         where id = $1 and status = 'rascunho' and student_id = $2`,
        [existing.id, user.id, JSON.stringify(sanitized)]
      )
    } catch (e: any) {
      return { ok: false, error: "Erro" }
    }
  } else {
    try {
      await query(
        `insert into public.content_exercise_submissions
           (content_item_id, student_id, status, answers)
         values ($1, $2, 'rascunho', $3::jsonb)
         on conflict (content_item_id, student_id)
         do update set answers = excluded.answers
         where public.content_exercise_submissions.status = 'rascunho'`,
        [contentItemId, user.id, JSON.stringify(sanitized)]
      )
    } catch (e: any) {
      return { ok: false, error: "Erro" }
    }
  }

  revalidateContentExercisePaths(contentItemId)
  return { ok: true }
}

export async function submitContentExercise(
  contentItemId: string,
  answers: StudentExamAnswers
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  type ItemRow = {
    settings: Record<string, unknown>
    status: string
    type: string
    author_id: string
    title: string | null
  }

  const item = await queryOne<ItemRow>(
    "select settings, status, type, author_id, title from public.content_items where id = $1",
    [contentItemId]
  )

  if (!item) return { ok: false, error: "Conteudo nao encontrado" }
  if (!isExamLikeContentType(item.type)) {
    return { ok: false, error: "Conteudo nao encontrado" }
  }
  if (item.status !== "published") {
    return { ok: false, error: "Conteudo indisponivel" }
  }
  if (item.author_id === user.id) {
    return { ok: false, error: "Autor nao envia resposta aqui" }
  }

  const exam = parseExamFromSettings(item.settings as Record<string, unknown>)
  if (!exam) return { ok: false, error: "Sem questoes neste conteudo" }

  if (isTimedExamContentType(item.type)) {
    const werr = assertAssessmentStudentWriteAllowed(
      item.settings as Record<string, unknown>
    )
    if (werr) return { ok: false, error: werr }
  }

  const err = validateAnswersForSubmit(exam, answers)
  if (err) return { ok: false, error: err }

  const sanitized: StudentExamAnswers = {}
  for (const q of exam.questions) {
    const a = answers[q.id]!
    if (q.type === "mcq" && a.type === "mcq") {
      sanitized[q.id] = {
        type: "mcq",
        choiceIndex: a.choiceIndex,
      }
    } else if (q.type === "open" && a.type === "open") {
      sanitized[q.id] = { type: "open", text: sanitizeOpenText(a.text) }
    }
  }

  const scoreMcq = computeMcqScore(exam, sanitized)
  const now = new Date().toISOString()

  const existing = await queryOne<{ id: string; status: string }>(
    "select id, status from public.content_exercise_submissions where content_item_id = $1 and student_id = $2",
    [contentItemId, user.id]
  )

  if (existing?.status === "enviado") {
    return { ok: false, error: "Prova ja enviada" }
  }

  const openScores: Record<string, number> = {}
  const scoreTotal = scoreMcq + sumOpenScores(exam, openScores)

  if (existing) {
    try {
      await query(
        `update public.content_exercise_submissions
         set answers = $3::jsonb,
             status = 'enviado',
             score_mcq = $4,
             open_scores = $5::jsonb,
             score_total = $6,
             submitted_at = $7
         where id = $1 and student_id = $2 and status = 'rascunho'`,
        [
          existing.id,
          user.id,
          JSON.stringify(sanitized),
          scoreMcq,
          JSON.stringify(openScores),
          scoreTotal,
          now,
        ]
      )
    } catch (e: any) {
      return { ok: false, error: "Erro" }
    }
  } else {
    try {
      await query(
        `insert into public.content_exercise_submissions
           (content_item_id, student_id, status, answers, score_mcq, open_scores, score_total, submitted_at)
         values ($1, $2, 'enviado', $3::jsonb, $4, $5::jsonb, $6, $7)
         on conflict (content_item_id, student_id)
         do update set
           status = 'enviado',
           answers = excluded.answers,
           score_mcq = excluded.score_mcq,
           open_scores = excluded.open_scores,
           score_total = excluded.score_total,
           submitted_at = excluded.submitted_at
         where public.content_exercise_submissions.status = 'rascunho'`,
        [
          contentItemId,
          user.id,
          JSON.stringify(sanitized),
          scoreMcq,
          JSON.stringify(openScores),
          scoreTotal,
          now,
        ]
      )
    } catch (e: any) {
      return { ok: false, error: "Erro" }
    }
  }

  revalidateContentExercisePaths(contentItemId)

  // Notifica o autor (professor) sobre a nova entrega
  const hasOpen = exam.questions.some((q) => q.type === "open")
  const studentRow = await queryOne<{ full_name: string | null }>(
    "select full_name from public.profiles where id = $1",
    [user.id]
  )
  const aluno = studentRow?.full_name?.trim() || "Um aluno"
  const titulo = item.title?.trim() || "atividade"
  await createNotification({
    recipientId: item.author_id,
    type: "submission_received",
    actorId: user.id,
    entityId: contentItemId,
    entityType: "content_item",
    message: hasOpen
      ? `${aluno} enviou "${titulo}" — requer correcao.`
      : `${aluno} enviou "${titulo}".`,
  }).catch((err) => console.error("[submitContentExercise notify]", err))

  return { ok: true }
}

export type ContentExerciseSubmissionListItem = ContentExerciseSubmissionRow & {
  student_name: string | null
}

export async function listContentExerciseSubmissionsForAuthor(
  contentItemId: string
): Promise<{ rows: ContentExerciseSubmissionListItem[]; error: string | null }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { rows: [], error: "Nao autenticado" }

  const item = await queryOne<{ author_id: string; type: string }>(
    "select author_id, type from public.content_items where id = $1",
    [contentItemId]
  )

  if (!item || item.author_id !== user.id || !isExamLikeContentType(item.type)) {
    return { rows: [], error: "Conteudo nao encontrado" }
  }

  let subs: Record<string, unknown>[] = []
  try {
    subs =
      (await query<Record<string, unknown>>(
        "select * from public.content_exercise_submissions where content_item_id = $1 order by submitted_at desc nulls last",
        [contentItemId]
      )) ?? []
  } catch (e: any) {
    return { rows: [], error: "Erro" }
  }

  const studentIds = [...new Set(subs.map((s) => s.student_id as string))]
  let nameById = new Map<string, string | null>()
  if (studentIds.length > 0) {
    const profs = await query<{ id: string; full_name: string | null }>(
      "select id, full_name from public.profiles where id = any($1::uuid[])",
      [studentIds]
    )
    nameById = new Map(
      (profs ?? []).map((p) => [p.id as string, p.full_name])
    )
  }

  const rows: ContentExerciseSubmissionListItem[] = subs.map((row) => {
    const base = mapRow(row)
    return {
      ...base,
      student_name: nameById.get(base.student_id) ?? null,
    }
  })

  return { rows, error: null }
}

export async function gradeContentExerciseOpenAnswers(
  contentItemId: string,
  submissionId: string,
  openScores: Record<string, number>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ci = await queryOne<{ settings: Record<string, unknown>; author_id: string; type: string; title: string | null }>(
    "select settings, author_id, type, title from public.content_items where id = $1",
    [contentItemId]
  )

  if (!ci || ci.author_id !== user.id || !isExamLikeContentType(ci.type)) {
    return { ok: false, error: "Conteudo nao encontrado" }
  }

  const exam = parseExamFromSettings(ci.settings as Record<string, unknown>)
  if (!exam) return { ok: false, error: "Conteudo sem questoes" }

  const merged: Record<string, number> = {}
  for (const q of exam.questions) {
    if (q.type !== "open") continue
    const v = openScores[q.id]
    if (v === undefined) continue
    if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > q.points) {
      return {
        ok: false,
        error: `Nota invalida na questao (max ${q.points})`,
      }
    }
    merged[q.id] = v
  }

  const sub = await queryOne<{
    id: string
    student_id: string
    score_mcq: number
    status: string
    open_scores: unknown
  }>(
    "select id, student_id, score_mcq, status, open_scores from public.content_exercise_submissions where id = $1 and content_item_id = $2",
    [submissionId, contentItemId]
  )

  if (!sub) return { ok: false, error: "Entrega nao encontrada" }
  if (sub.status !== "enviado") {
    return { ok: false, error: "Apenas entregas enviadas podem ser corrigidas" }
  }

  const prev = parseOpenScores(sub.open_scores)
  const nextOpen = { ...prev, ...merged }
  const scoreTotal =
    Number(sub.score_mcq ?? 0) + sumOpenScores(exam, nextOpen)

  try {
    await query(
      `update public.content_exercise_submissions
       set open_scores = $2::jsonb,
           score_total = $3
       where id = $1 and status = 'enviado'`,
      [submissionId, JSON.stringify(nextOpen), scoreTotal]
    )
  } catch (e: any) {
    return { ok: false, error: "Erro" }
  }
  revalidateContentExercisePaths(contentItemId)
  if (sub.student_id) {
    await createNotification({
      recipientId: sub.student_id,
      type: "activity_graded",
      actorId: user.id,
      entityId: contentItemId,
      entityType: "content_item",
      message: `Seu exercicio "${ci.title?.trim() || "exercicio"}" foi corrigido.`,
    }).catch((err) => console.error("[gradeContentExerciseOpenAnswers notify]", err))
  }
  return { ok: true }
}

/** Gabarito MCQ para feedback ao aluno apos envio (servidor). */
export async function getMcqSolutionsForContentExercise(
  contentItemId: string
): Promise<Record<string, number> | null> {
  // Autorizacao na propria action: a RLS e inerte e toda funcao "use server" e
  // um endpoint POST. Sem isso, qualquer um obteria o gabarito antes de responder.
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return null

  const row = await queryOne<{
    settings: Record<string, unknown>
    type: string
    author_id: string
  }>(
    "select settings, type, author_id from public.content_items where id = $1",
    [contentItemId]
  )

  if (!row || !isExamLikeContentType(row.type)) return null

  // So libera o gabarito para o autor (preview/correcao) ou para o aluno que JA enviou.
  if (row.author_id !== user.id) {
    const sub = await queryOne<{ status: string }>(
      "select status from public.content_exercise_submissions where content_item_id = $1 and student_id = $2",
      [contentItemId, user.id]
    )
    if (sub?.status !== "enviado") return null
  }

  const exam = parseExamFromSettings(row.settings as Record<string, unknown>)
  if (!exam) return null
  const out: Record<string, number> = {}
  for (const q of exam.questions) {
    if (q.type === "mcq") out[q.id] = q.correctIndex
  }
  return out
}

/** Definicao completa com gabarito — APENAS o autor do conteudo (correcao / preview). */
export async function getExamDefinitionForContentItem(
  contentItemId: string
): Promise<ActivityExamDefinition | null> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return null

  const row = await queryOne<{
    settings: Record<string, unknown>
    type: string
    author_id: string
  }>(
    "select settings, type, author_id from public.content_items where id = $1",
    [contentItemId]
  )

  if (!row || !isExamLikeContentType(row.type)) return null
  // Gabarito completo (com correctIndex) jamais vai para nao-autor.
  if (row.author_id !== user.id) return null
  return parseExamFromSettings(row.settings as Record<string, unknown>)
}
