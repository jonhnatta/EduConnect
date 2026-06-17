"use server"

import { revalidatePath } from "next/cache"
import { requireAuthedUser } from "@/lib/auth/user"
import {
  getProfessorActionAccess,
  getApprovedProfessorActionAccess,
} from "@/lib/auth/guards"
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
  ungradedOpenCount,
  validateAnswersForSubmit,
  type StudentExamAnswers,
  validateExamDefinition,
} from "@/lib/activities/exam"
import {
  type ActivityAttachment,
  parseActivityAttachments,
  isAllowedActivityAttachmentType,
  effectiveContentType,
  safeUploadFilename,
  ACTIVITY_ATTACHMENT_MAX_BYTES,
} from "@/lib/activities/attachments"
import {
  parseTrabalhoConfig,
  trabalhoModeRequiresText,
  trabalhoModeRequiresFile,
} from "@/lib/activities/trabalho"
import { put, del } from "@/lib/blob"
import { randomUUID } from "crypto"
export type ActivitySubmissionRow = {
  id: string
  activity_id: string
  student_id: string
  status: "rascunho" | "enviado"
  answers: StudentExamAnswers
  score_mcq: number
  open_scores: Record<string, number>
  score_total: number | null
  submitted_at: string | null
  /** Entrega de trabalho: texto livre do aluno */
  submission_text: string | null
  /** Entrega de trabalho: arquivos anexados pelo aluno */
  submission_attachments: ActivityAttachment[]
  created_at: string
  updated_at: string
}

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

function parseOpenScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number" && !Number.isNaN(v) && v >= 0) out[k] = v
  }
  return out
}

function mapSubmissionRow(data: Record<string, unknown>): ActivitySubmissionRow {
  return {
    id: data.id as string,
    activity_id: data.activity_id as string,
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
    submission_text:
      typeof data.submission_text === "string" ? data.submission_text : null,
    submission_attachments: parseActivityAttachments({
      attachments: data.submission_attachments,
    }),
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  }
}

async function assertStudentMember(
  classroomId: string,
  userId: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "select id from public.classroom_members where classroom_id = $1 and student_id = $2",
    [classroomId, userId]
  )
  return !!row
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

/**
 * Impoe a janela de tempo da atividade. O status so vira 'encerrada' por acao MANUAL
 * do professor — sem este check, envios antes da abertura ou apos o prazo seriam aceitos.
 */
function assertActivityWindowAllowed(
  startsAt: string | Date | null | undefined,
  dueAt: string | Date | null | undefined
): string | null {
  const now = Date.now()
  if (startsAt) {
    const t = new Date(startsAt).getTime()
    if (!Number.isNaN(t) && t > now) return "A atividade ainda nao esta aberta."
  }
  if (dueAt) {
    const t = new Date(dueAt).getTime()
    if (!Number.isNaN(t) && t < now) return "O prazo de entrega encerrou."
  }
  return null
}

function revalidateActivityPaths(classroomId: string, activityId: string) {
  revalidatePath(`/dashboard/aluno/salas/${classroomId}/atividades/${activityId}`)
  revalidatePath(`/dashboard/aluno/salas/${classroomId}`)
  revalidatePath(`/dashboard/professor/salas/${classroomId}`)
}

export type StudentSubmissionGrade = {
  status: "rascunho" | "enviado"
  score_total: number | null
  score_mcq: number
}

/** Notas do aluno nas atividades desta sala (para lista / resumo). */
export async function getMySubmissionGradesForClassroom(
  classroomId: string
): Promise<{ byActivity: Record<string, StudentSubmissionGrade>; error: string | null }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { byActivity: {}, error: "Nao autenticado" }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) return { byActivity: {}, error: "Voce nao participa desta sala" }

  const acts = await query<{ id: string }>(
    "select id from public.classroom_activities where classroom_id = $1",
    [classroomId]
  ).catch((e: any) => {
    throw e
  })
  const activityIds = (acts ?? []).map((a) => a.id)
  if (activityIds.length === 0) return { byActivity: {}, error: null }

  const subs = await query<{ activity_id: string; status: string; score_total: number | null; score_mcq: number }>(
    "select activity_id, status, score_total, score_mcq from public.classroom_activity_submissions where student_id = $1 and activity_id = any($2::uuid[])",
    [user.id, activityIds]
  ).catch((e: any) => {
    throw e
  })

  const byActivity: Record<string, StudentSubmissionGrade> = {}
  for (const row of subs ?? []) {
    const aid = row.activity_id as string
    byActivity[aid] = {
      status: row.status as "rascunho" | "enviado",
      score_total:
        row.score_total === null || row.score_total === undefined
          ? null
          : Number(row.score_total),
      score_mcq: Number(row.score_mcq ?? 0),
    }
  }

  return { byActivity, error: null }
}

/** Prova sem gabarito (para aluno). */
export async function getExamForStudent(
  classroomId: string,
  activityId: string
): Promise<
  | { ok: true; exam: ActivityExamPublic }
  | { ok: false; error: string }
> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) return { ok: false, error: "Voce nao participa desta sala" }

  const data = await queryOne<{ settings: any; status: string }>(
    "select settings, status from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )
  if (!data || data.status === "rascunho") {
    return { ok: false, error: "Atividade nao encontrada" }
  }

  const exam = parseExamFromSettings(
    asRecord(data.settings)
  )
  if (!exam) return { ok: false, error: "Esta atividade nao tem questoes" }
  const err = validateExamDefinition(exam)
  if (err) return { ok: false, error: err }
  return { ok: true, exam: toPublicExam(exam) }
}

export async function getMySubmission(
  classroomId: string,
  activityId: string
): Promise<{
  submission: ActivitySubmissionRow | null
  error: string | null
}> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { submission: null, error: "Nao autenticado" }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) return { submission: null, error: "Voce nao participa desta sala" }

  const data = await queryOne<Record<string, unknown>>(
    "select * from public.classroom_activity_submissions where activity_id = $1 and student_id = $2",
    [activityId, user.id]
  )
  if (!data) return { submission: null, error: null }
  return { submission: mapSubmissionRow(data), error: null }
}

export async function saveSubmissionDraft(
  classroomId: string,
  activityId: string,
  answers: StudentExamAnswers
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) return { ok: false, error: "Voce nao participa desta sala" }

  const act = await queryOne<{ id: string; status: string; settings: any; starts_at: string | Date | null; due_at: string | Date | null }>(
    "select id, status, settings, starts_at, due_at from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )
  if (!act) return { ok: false, error: "Atividade nao encontrada" }
  if (act.status === "rascunho") return { ok: false, error: "Atividade indisponivel" }
  if (act.status === "encerrada") {
    return { ok: false, error: "Atividade encerrada" }
  }
  const windowErr = assertActivityWindowAllowed(act.starts_at, act.due_at)
  if (windowErr) return { ok: false, error: windowErr }

  const exam = parseExamFromSettings(asRecord(act.settings))
  if (!exam) return { ok: false, error: "Sem questoes nesta atividade" }

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
    "select id, status from public.classroom_activity_submissions where activity_id = $1 and student_id = $2",
    [activityId, user.id]
  )

  if (existing?.status === "enviado") {
    return { ok: false, error: "Prova ja enviada" }
  }

  if (existing) {
    try {
      await query(
        "update public.classroom_activity_submissions set answers = $1::jsonb, updated_at = timezone('utc'::text, now()) where id = $2 and status = 'rascunho'",
        [JSON.stringify(sanitized), existing.id]
      )
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Erro ao salvar rascunho" }
    }
  } else {
    try {
      await query(
        "insert into public.classroom_activity_submissions (activity_id, student_id, status, answers) values ($1, $2, 'rascunho', $3::jsonb)",
        [activityId, user.id, JSON.stringify(sanitized)]
      )
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Erro ao salvar rascunho" }
    }
  }

  revalidateActivityPaths(classroomId, activityId)
  return { ok: true }
}

export async function submitExam(
  classroomId: string,
  activityId: string,
  answers: StudentExamAnswers
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) return { ok: false, error: "Voce nao participa desta sala" }

  const act = await queryOne<{ settings: any; status: string; starts_at: string | Date | null; due_at: string | Date | null; title: string | null }>(
    "select settings, status, starts_at, due_at, title from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )
  if (!act) return { ok: false, error: "Atividade nao encontrada" }
  if (act.status === "rascunho") return { ok: false, error: "Atividade indisponivel" }
  if (act.status === "encerrada") {
    return { ok: false, error: "Atividade encerrada" }
  }
  const windowErr = assertActivityWindowAllowed(act.starts_at, act.due_at)
  if (windowErr) return { ok: false, error: windowErr }

  const exam = parseExamFromSettings(asRecord(act.settings))
  if (!exam) return { ok: false, error: "Sem questoes nesta atividade" }

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
    "select id, status from public.classroom_activity_submissions where activity_id = $1 and student_id = $2",
    [activityId, user.id]
  )

  if (existing?.status === "enviado") {
    return { ok: false, error: "Prova ja enviada" }
  }

  const openScores: Record<string, number> = {}
  const scoreTotal = scoreMcq + sumOpenScores(exam, openScores)

  if (existing) {
    try {
      await query(
        `update public.classroom_activity_submissions
         set answers = $1::jsonb, status = 'enviado', score_mcq = $2, open_scores = $3::jsonb, score_total = $4, submitted_at = $5
         where id = $6 and status = 'rascunho'`,
        [JSON.stringify(sanitized), scoreMcq, JSON.stringify(openScores), scoreTotal, now, existing.id]
      )
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Erro ao enviar" }
    }
  } else {
    try {
      await query(
        `insert into public.classroom_activity_submissions
         (activity_id, student_id, status, answers, score_mcq, open_scores, score_total, submitted_at)
         values ($1,$2,'enviado',$3::jsonb,$4,$5::jsonb,$6,$7)`,
        [activityId, user.id, JSON.stringify(sanitized), scoreMcq, JSON.stringify(openScores), scoreTotal, now]
      )
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Erro ao enviar" }
    }
  }

  revalidateActivityPaths(classroomId, activityId)

  // Notifica o professor da sala sobre a nova entrega
  const hasOpen = exam.questions.some((q) => q.type === "open")
  const info = await queryOne<{ professor_id: string; student_name: string | null }>(
    `SELECT c.professor_id, p.full_name AS student_name
       FROM public.classrooms c, public.profiles p
      WHERE c.id = $1 AND p.id = $2`,
    [classroomId, user.id]
  )
  if (info?.professor_id) {
    const aluno = info.student_name?.trim() || "Um aluno"
    const titulo = act.title?.trim() || "atividade"
    await createNotification({
      recipientId: info.professor_id,
      type: "submission_received",
      actorId: user.id,
      entityId: activityId,
      entityType: "activity",
      message: hasOpen
        ? `${aluno} enviou "${titulo}" — requer correcao.`
        : `${aluno} enviou "${titulo}".`,
    }).catch((err) => console.error("[submitExam notify]", err))
  }

  return { ok: true }
}

const TRABALHO_TEXT_MAX = 20_000

/** Aluno faz upload dos arquivos da entrega de um trabalho (armazenados no MinIO). */
export async function uploadTrabalhoFiles(
  classroomId: string,
  activityId: string,
  formData: FormData
): Promise<
  { ok: true; attachments: ActivityAttachment[] } | { ok: false; error: string }
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }

  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) return { ok: false, error: "Voce nao participa desta sala" }

  const act = await queryOne<{ settings: any; type: string }>(
    "select settings, type from public.classroom_activities where id = $1 and classroom_id = $2 and status <> 'rascunho'",
    [activityId, classroomId]
  )
  if (!act || act.type !== "trabalho") return { ok: false, error: "Atividade nao encontrada" }

  const cfg = parseTrabalhoConfig(asRecord(act.settings))
  if (!cfg || !trabalhoModeRequiresFile(cfg.mode)) {
    return { ok: false, error: "Esta atividade nao aceita arquivos" }
  }

  const raw = formData.getAll("files")
  const files = raw.filter((x): x is File => x instanceof File && x.size > 0)
  if (files.length === 0) return { ok: false, error: "Nenhum arquivo selecionado" }
  if (files.length > cfg.maxFiles) {
    return { ok: false, error: `No maximo ${cfg.maxFiles} arquivo(s)` }
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
        throw new Error("Tipo nao permitido. Use PDF, Word (.doc/.docx) ou imagem")
      }
      const safe = safeUploadFilename(file.name)
      const pathname = `classroom-activities/${classroomId}/submissions/${activityId}/${user.id}/${randomUUID()}-${safe}`
      const contentType = effectiveContentType(file)
      const blob = await put(pathname, file, { access: "private", token, contentType })
      uploaded.push({
        url: blob.url,
        pathname: blob.pathname,
        filename: file.name,
        contentType,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      })
    }
    return { ok: true, attachments: uploaded }
  } catch (e) {
    await Promise.all(uploaded.map((a) => del(a.url).catch(() => {})))
    return { ok: false, error: e instanceof Error ? e.message : "Falha no upload" }
  }
}

/** Aluno envia a entrega de um trabalho (texto e/ou arquivos, conforme o modo exigido). */
export async function submitTrabalho(
  classroomId: string,
  activityId: string,
  input: { text: string; attachments: ActivityAttachment[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) return { ok: false, error: "Voce nao participa desta sala" }

  const act = await queryOne<{ settings: any; type: string; status: string; starts_at: string | Date | null; due_at: string | Date | null; title: string | null }>(
    "select settings, type, status, starts_at, due_at, title from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )
  if (!act || act.type !== "trabalho") return { ok: false, error: "Atividade nao encontrada" }
  if (act.status === "rascunho") return { ok: false, error: "Atividade indisponivel" }
  if (act.status === "encerrada") return { ok: false, error: "Atividade encerrada" }
  const windowErr = assertActivityWindowAllowed(act.starts_at, act.due_at)
  if (windowErr) return { ok: false, error: windowErr }

  const cfg = parseTrabalhoConfig(asRecord(act.settings))
  if (!cfg) return { ok: false, error: "Esta atividade nao esta configurada para entrega" }

  const text = (input.text ?? "").trim().slice(0, TRABALHO_TEXT_MAX)
  const attachments = Array.isArray(input.attachments) ? input.attachments : []

  if (trabalhoModeRequiresText(cfg.mode) && !text) {
    return { ok: false, error: "Escreva sua resposta para enviar" }
  }
  if (trabalhoModeRequiresFile(cfg.mode) && attachments.length === 0) {
    return { ok: false, error: "Anexe ao menos um arquivo para enviar" }
  }
  if (attachments.length > cfg.maxFiles) {
    return { ok: false, error: `No maximo ${cfg.maxFiles} arquivo(s)` }
  }
  // Segurança: os anexos precisam pertencer ao caminho de entrega deste aluno
  const prefix = `classroom-activities/${classroomId}/submissions/${activityId}/${user.id}/`
  for (const a of attachments) {
    const key = a.pathname || ""
    if (!key.startsWith(prefix) || key.includes("..")) {
      return { ok: false, error: "Anexo invalido" }
    }
  }

  const existing = await queryOne<{ id: string; status: string }>(
    "select id, status from public.classroom_activity_submissions where activity_id = $1 and student_id = $2",
    [activityId, user.id]
  )
  if (existing?.status === "enviado") return { ok: false, error: "Trabalho ja enviado" }

  const now = new Date().toISOString()
  const attachJson = JSON.stringify(attachments)
  try {
    if (existing) {
      await query(
        `update public.classroom_activity_submissions
         set status = 'enviado', submission_text = $1, submission_attachments = $2::jsonb, submitted_at = $3
         where id = $4 and status = 'rascunho'`,
        [text || null, attachJson, now, existing.id]
      )
    } else {
      await query(
        `insert into public.classroom_activity_submissions
         (activity_id, student_id, status, submission_text, submission_attachments, submitted_at)
         values ($1,$2,'enviado',$3,$4::jsonb,$5)`,
        [activityId, user.id, text || null, attachJson, now]
      )
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao enviar" }
  }

  revalidateActivityPaths(classroomId, activityId)

  // Notifica o professor da sala sobre a nova entrega
  const info = await queryOne<{ professor_id: string; student_name: string | null }>(
    `SELECT c.professor_id, p.full_name AS student_name
       FROM public.classrooms c, public.profiles p
      WHERE c.id = $1 AND p.id = $2`,
    [classroomId, user.id]
  )
  if (info?.professor_id) {
    const aluno = info.student_name?.trim() || "Um aluno"
    const titulo = act.title?.trim() || "trabalho"
    await createNotification({
      recipientId: info.professor_id,
      type: "submission_received",
      actorId: user.id,
      entityId: activityId,
      entityType: "activity",
      message: `${aluno} enviou "${titulo}" — requer correcao.`,
    }).catch((err) => console.error("[submitTrabalho notify]", err))
  }

  return { ok: true }
}

/** Professor atribui a nota final de um trabalho (0..max_score). */
export async function gradeTrabalho(
  classroomId: string,
  activityId: string,
  submissionId: string,
  score: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const act = await queryOne<{ max_score: number | null; type: string; title: string | null }>(
    "select max_score, type, title from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )
  if (!act || act.type !== "trabalho") return { ok: false, error: "Atividade nao encontrada" }

  const max = act.max_score ?? 10
  const v = Number(score)
  if (!Number.isFinite(v) || v < 0 || v > max) {
    return { ok: false, error: `Nota invalida (0 a ${max})` }
  }

  const sub = await queryOne<{ id: string; student_id: string; status: string }>(
    "select id, student_id, status from public.classroom_activity_submissions where id = $1 and activity_id = $2",
    [submissionId, activityId]
  )
  if (!sub) return { ok: false, error: "Entrega nao encontrada" }
  if (sub.status !== "enviado") return { ok: false, error: "Apenas entregas enviadas podem ser corrigidas" }

  try {
    await query(
      "update public.classroom_activity_submissions set score_total = $1 where id = $2 and status = 'enviado'",
      [v, submissionId]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao corrigir" }
  }

  revalidateActivityPaths(classroomId, activityId)
  if (sub.student_id) {
    revalidatePath(`/dashboard/professor/alunos/${sub.student_id}`)
    await createNotification({
      recipientId: sub.student_id,
      type: "activity_graded",
      actorId: access.userId,
      entityId: activityId,
      entityType: "activity",
      message: `Seu trabalho "${act.title?.trim() || "trabalho"}" foi corrigido.`,
    }).catch((err) => console.error("[gradeTrabalho notify]", err))
  }
  return { ok: true }
}

export type SubmissionListItem = ActivitySubmissionRow & {
  student_name: string | null
}

export async function listSubmissionsForActivity(
  classroomId: string,
  activityId: string
): Promise<{ rows: SubmissionListItem[]; error: string | null }> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { rows: [], error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { rows: [], error: "Sala nao encontrada" }

  const act = await queryOne<{ id: string }>(
    "select id from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )

  if (!act) return { rows: [], error: "Atividade nao encontrada" }

  let subs: Record<string, unknown>[] = []
  try {
    subs = await query<Record<string, unknown>>(
      "select * from public.classroom_activity_submissions where activity_id = $1 order by submitted_at desc nulls last",
      [activityId]
    )
  } catch (e: any) {
    return { rows: [], error: e?.message ?? "Erro ao listar entregas" }
  }
  const studentIds = [...new Set(subs.map((s) => s.student_id as string))]
  let nameById = new Map<string, string | null>()
  if (studentIds.length > 0) {
    const profs = await query<{ id: string; full_name: string | null }>(
      "select id, full_name from public.profiles where id = any($1::uuid[])",
      [studentIds]
    ).catch(() => [])
    nameById = new Map(
      (profs ?? []).map((p) => [p.id, p.full_name ?? null])
    )
  }

  const rows: SubmissionListItem[] = subs.map((row) => {
    const base = mapSubmissionRow(row)
    return {
      ...base,
      student_name: nameById.get(base.student_id) ?? null,
    }
  })

  return { rows, error: null }
}

export async function getSubmissionEnviosByActivity(
  classroomId: string,
  activityIds: string[]
): Promise<Record<string, number>> {
  const access = await getProfessorActionAccess()
  if (!access.ok || activityIds.length === 0) return {}

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return {}

  const data = await query<{ activity_id: string }>(
    "select activity_id from public.classroom_activity_submissions where activity_id = any($1::uuid[]) and status = 'enviado'",
    [activityIds]
  ).catch(() => [])

  const counts: Record<string, number> = {}
  for (const id of activityIds) counts[id] = 0
  for (const row of data ?? []) {
    const aid = row.activity_id as string
    counts[aid] = (counts[aid] ?? 0) + 1
  }
  return counts
}

/**
 * Para cada atividade, conta quantas entregas (status enviado) ainda têm questões
 * abertas sem nota — ou seja, pendentes de correção manual do professor.
 */
export async function getPendingGradingByActivity(
  classroomId: string,
  activityIds: string[]
): Promise<Record<string, number>> {
  const access = await getProfessorActionAccess()
  if (!access.ok || activityIds.length === 0) return {}

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return {}

  const acts = await query<{ id: string; settings: unknown }>(
    "select id, settings from public.classroom_activities where id = any($1::uuid[]) and classroom_id = $2",
    [activityIds, classroomId]
  ).catch(() => [])

  const examByActivity = new Map<string, ActivityExamDefinition>()
  const trabalhoActivities = new Set<string>()
  for (const a of acts ?? []) {
    const settings = asRecord(a.settings)
    const exam = parseExamFromSettings(settings)
    if (exam && exam.questions.some((q) => q.type === "open")) {
      examByActivity.set(a.id as string, exam)
    } else if (parseTrabalhoConfig(settings)) {
      // Trabalho com entrega: pendente = enviado e ainda sem nota
      trabalhoActivities.add(a.id as string)
    }
  }

  const counts: Record<string, number> = {}
  for (const id of activityIds) counts[id] = 0
  const relevant = [...examByActivity.keys(), ...trabalhoActivities]
  if (relevant.length === 0) return counts

  const subs = await query<{ activity_id: string; open_scores: unknown; score_total: number | null }>(
    "select activity_id, open_scores, score_total from public.classroom_activity_submissions where activity_id = any($1::uuid[]) and status = 'enviado'",
    [relevant]
  ).catch(() => [])

  for (const sub of subs ?? []) {
    const aid = sub.activity_id as string
    if (trabalhoActivities.has(aid)) {
      if (sub.score_total === null || sub.score_total === undefined) {
        counts[aid] = (counts[aid] ?? 0) + 1
      }
      continue
    }
    const exam = examByActivity.get(aid)
    if (!exam) continue
    if (ungradedOpenCount(exam, parseOpenScores(sub.open_scores)) > 0) {
      counts[aid] = (counts[aid] ?? 0) + 1
    }
  }
  return counts
}

export async function countSubmissionsForActivity(
  classroomId: string,
  activityId: string
): Promise<{ enviados: number; total: number; error: string | null }> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { enviados: 0, total: 0, error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { enviados: 0, total: 0, error: "Sala nao encontrada" }

  try {
    const row = await queryOne<{ total: number; enviados: number }>(
      `select
         (select count(*)::int from public.classroom_activity_submissions where activity_id = $1) as total,
         (select count(*)::int from public.classroom_activity_submissions where activity_id = $1 and status = 'enviado') as enviados`,
      [activityId]
    )
    return { enviados: row?.enviados ?? 0, total: row?.total ?? 0, error: null }
  } catch (e: any) {
    return { enviados: 0, total: 0, error: e?.message ?? "Erro" }
  }

  // unreachable
}

export async function gradeOpenAnswers(
  classroomId: string,
  activityId: string,
  submissionId: string,
  openScores: Record<string, number>
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Atribuir nota e gestao de avaliacao -> exige professor APROVADO (consistente com A3).
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const act = await queryOne<{ settings: any; title: string | null }>(
    "select settings, title from public.classroom_activities where id = $1 and classroom_id = $2",
    [activityId, classroomId]
  )
  if (!act) return { ok: false, error: "Atividade nao encontrada" }

  const exam = parseExamFromSettings(asRecord(act.settings))
  if (!exam) return { ok: false, error: "Atividade sem prova" }

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

  const sub = await queryOne<{ id: string; student_id: string; score_mcq: number; status: string; open_scores: any }>(
    "select id, student_id, score_mcq, status, open_scores from public.classroom_activity_submissions where id = $1 and activity_id = $2",
    [submissionId, activityId]
  )
  if (!sub) return { ok: false, error: "Entrega nao encontrada" }
  if (sub.status !== "enviado") {
    return { ok: false, error: "Apenas provas enviadas podem ser corrigidas" }
  }

  const prev = parseOpenScores(sub.open_scores)
  const nextOpen = { ...prev, ...merged }
  const scoreTotal =
    Number(sub.score_mcq ?? 0) + sumOpenScores(exam, nextOpen)

  try {
    await query(
      "update public.classroom_activity_submissions set open_scores = $1::jsonb, score_total = $2 where id = $3 and status = 'enviado'",
      [JSON.stringify(nextOpen), scoreTotal, submissionId]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao corrigir" }
  }
  revalidateActivityPaths(classroomId, activityId)
  const sid = sub.student_id as string | undefined
  if (sid) {
    revalidatePath(`/dashboard/professor/alunos/${sid}`)
    await createNotification({
      recipientId: sid,
      type: "activity_graded",
      actorId: access.userId,
      entityId: activityId,
      entityType: "activity",
      message: `Sua atividade "${act.title?.trim() || "atividade"}" foi corrigida.`,
    }).catch((err) => console.error("[gradeOpenAnswers notify]", err))
  }
  return { ok: true }
}
