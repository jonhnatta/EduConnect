"use server"

import { del, put } from "@/lib/blob"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { requireAuthedUser } from "@/lib/auth/user"
import {
  getApprovedProfessorActionAccess,
  getProfessorActionAccess,
} from "@/lib/auth/guards"
import { dbPool } from "@/lib/db/pool"
import { query, queryOne } from "@/lib/db/query"
import {
  effectiveContentType,
  inferMimeFromFilename,
  safeUploadFilename,
} from "@/lib/activities/attachments"
import { buildInviteCode, normalizeInviteCodeInput } from "@/lib/classrooms/invite-code"
import {
  displayProfessorStudentName,
} from "@/lib/classrooms/professor-students-display"
import type {
  ClassroomPreview,
  ClassroomRow,
  JoinClassroomResult,
  ProfessorStudentClassroomRef,
  ProfessorStudentRow,
} from "@/lib/classrooms/types"
import { checkRateLimit } from "@/lib/security/rate-limit"

const MAX_CREATE_ATTEMPTS = 8

const MURAL_DESCRIPTION_MAX_CHARS = 5000
const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024

const COVER_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

function isCoverImageType(mime: string, filename: string): boolean {
  if (mime && COVER_IMAGE_TYPES.has(mime)) return true
  const inferred = inferMimeFromFilename(filename)
  return inferred != null && COVER_IMAGE_TYPES.has(inferred)
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

function revalidateClassroomMuralPaths(classroomId: string) {
  revalidatePath(`/dashboard/professor/salas/${classroomId}`)
  revalidatePath(`/dashboard/aluno/salas/${classroomId}`)
}

export type CreateClassroomInput = {
  name: string
  subject: string
  educationLevel: string
  description: string
  maxStudents: number | null
  isPublic?: boolean
}

export async function createClassroom(
  input: CreateClassroomInput
): Promise<{ ok: true; id: string; inviteCode: string } | { ok: false; error: string }> {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const name = input.name.trim()
  const subject = input.subject.trim()
  const educationLevel = input.educationLevel.trim()
  if (!name || !subject || !educationLevel) {
    return { ok: false, error: "Preencha nome, disciplina e nivel de ensino" }
  }

  let lastError: string | null = null
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const inviteCode = buildInviteCode()
    try {
      const data = await queryOne<{ id: string; invite_code: string }>(
        `insert into public.classrooms
          (professor_id, name, subject, education_level, description, invite_code, max_students, is_public, status, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'ativa', timezone('utc'::text, now()), timezone('utc'::text, now()))
         returning id, invite_code`,
        [
          access.userId,
          name,
          subject,
          educationLevel,
          input.description.trim() || null,
          inviteCode,
          input.maxStudents,
          input.isPublic ?? false,
        ]
      )
      if (data) {
      revalidatePath("/dashboard/professor/salas")
      return { ok: true, id: data.id, inviteCode: data.invite_code }
      }
      lastError = "Erro ao criar sala"
      break
    } catch (e: any) {
      if (e?.code === "23505") {
        lastError = "Colisao de codigo, tentando novamente"
        continue
      }
      lastError = "Erro ao criar sala"
      break
    }
  }

  return { ok: false, error: lastError ?? "Erro ao criar sala" }
}

function mapJoinRpc(payload: unknown): JoinClassroomResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Resposta invalida" }
  }
  const o = payload as Record<string, unknown>
  if (o.ok === true && typeof o.classroom_id === "string") {
    return { ok: true, classroomId: o.classroom_id }
  }
  const err = typeof o.error === "string" ? o.error : "unknown"
  const messages: Record<string, string> = {
    not_authenticated: "Faca login para entrar na sala",
    only_students: "Apenas contas de aluno podem entrar em salas",
    invalid_or_closed: "Codigo invalido ou sala encerrada",
    full: "Esta sala atingiu o limite de alunos",
    unknown: "Nao foi possivel entrar na sala",
  }
  return { ok: false, error: messages[err] ?? messages.unknown }
}

export async function joinClassroomByInvite(
  rawCode: string
): Promise<JoinClassroomResult> {
  const code = normalizeInviteCodeInput(rawCode)
  if (!code) return { ok: false, error: "Informe o codigo de convite" }

  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Faca login para entrar na sala" }

  let data: any = null
  try {
    const row = await queryOne<{ join_classroom_by_invite: any }>(
      "select public.join_classroom_by_invite($1, $2) as join_classroom_by_invite",
      [user.id, code]
    )
    data = row?.join_classroom_by_invite ?? null
  } catch (e: any) {
    return { ok: false, error: "Nao foi possivel entrar na sala" }
  }

  const result = mapJoinRpc(data)
  if (result.ok) {
    revalidatePath("/dashboard/aluno/salas")
    revalidatePath("/dashboard/professor/salas")
  }
  return result
}

export async function listClassroomsForProfessor(): Promise<{
  rows: (ClassroomRow & { member_count: number })[]
  error: string | null
}> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { rows: [], error: access.error }

  try {
    const rows = await query<(ClassroomRow & { member_count: number })>(
      `select c.*, count(cm.id)::int as member_count
       from public.classrooms c
       left join public.classroom_members cm on cm.classroom_id = c.id
       where c.professor_id = $1
       group by c.id
       order by c.created_at desc`,
      [access.userId]
    )
    return { rows, error: null }
  } catch (e: any) {
    return { rows: [], error: "Erro ao carregar salas" }
  }
}

export async function listClassroomsForStudent(): Promise<{
  rows: (ClassroomRow & { professor_name: string | null })[]
  error: string | null
}> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { rows: [], error: "Nao autenticado" }

  try {
    const rows = await query<(ClassroomRow & { professor_name: string | null })>(
      `select c.*, p.full_name as professor_name
       from public.classroom_members cm
       join public.classrooms c on c.id = cm.classroom_id
       join public.profiles p on p.id = c.professor_id
       where cm.student_id = $1
       order by c.created_at desc`,
      [user.id]
    )
    return { rows, error: null }
  } catch (e: any) {
    return { rows: [], error: "Erro ao carregar salas" }
  }
}

export type PublicClassroomItem = {
  id: string
  name: string
  subject: string
  education_level: string
  description: string | null
  professor_name: string
  professor_slug: string | null
  member_count: number
}

export async function listPublicClassrooms(limit = 30): Promise<PublicClassroomItem[]> {
  // Server action é endpoint POST: exige autenticação (não confiar só no guard da página).
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return []
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit)) || 30), 100)
  const rows = await query<PublicClassroomItem>(
    `SELECT c.id, c.name, c.subject, c.education_level, c.description,
            p.full_name AS professor_name, p.slug AS professor_slug,
            count(cm.id)::int AS member_count
       FROM public.classrooms c
       JOIN public.profiles p ON p.id = c.professor_id
       LEFT JOIN public.classroom_members cm ON cm.classroom_id = c.id
      WHERE c.is_public = true AND c.status = 'ativa'
        AND p.deleted_at IS NULL AND p.account_status = 'active'
        AND p.professor_verification_status = 'approved'
      GROUP BY c.id, p.full_name, p.slug
      ORDER BY c.created_at DESC
      LIMIT $1`,
    [safeLimit]
  )
  return rows ?? []
}

export async function getClassroomForProfessor(
  classroomId: string
): Promise<{ row: ClassroomRow & { member_count: number }; error: string | null } | { row: null; error: string }> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { row: null, error: access.error }

  try {
    const row = await queryOne<(ClassroomRow & { member_count: number })>(
      `select c.*, count(cm.id)::int as member_count
       from public.classrooms c
       left join public.classroom_members cm on cm.classroom_id = c.id
       where c.id = $1 and c.professor_id = $2
       group by c.id`,
      [classroomId, access.userId]
    )
    if (!row) return { row: null, error: "Sala nao encontrada" }
    return { row, error: null }
  } catch (e: any) {
    return { row: null, error: "Sala nao encontrada" }
  }
}

export async function getClassroomForStudent(
  classroomId: string
): Promise<{ row: ClassroomRow & { professor_name: string | null }; error: string | null } | { row: null; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { row: null, error: "Nao autenticado" }

  try {
    const row = await queryOne<(ClassroomRow & { professor_name: string | null })>(
      `select c.*, p.full_name as professor_name
       from public.classroom_members cm
       join public.classrooms c on c.id = cm.classroom_id
       join public.profiles p on p.id = c.professor_id
       where cm.classroom_id = $1 and cm.student_id = $2`,
      [classroomId, user.id]
    )
    if (!row) return { row: null, error: "Voce nao participa desta sala" }
    return { row, error: null }
  } catch (e: any) {
    return { row: null, error: "Sala nao encontrada" }
  }
}

export async function listMembersForClassroom(classroomId: string): Promise<{
  members: { student_id: string; full_name: string | null; joined_at: string }[]
  error: string | null
}> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { members: [], error: access.error }

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) return { members: [], error: "Sala nao encontrada" }

  try {
    const members = await query<{ student_id: string; full_name: string | null; joined_at: string }>(
      `select cm.student_id, p.full_name, cm.joined_at
       from public.classroom_members cm
       join public.profiles p on p.id = cm.student_id
       where cm.classroom_id = $1
       order by cm.joined_at asc`,
      [classroomId]
    )
    return { members, error: null }
  } catch (e: any) {
    return { members: [], error: "Erro ao listar alunos" }
  }
}

const PROFESSOR_STUDENTS_DEFAULT_PAGE_SIZE = 25
const PROFESSOR_STUDENTS_MAX_PAGE_SIZE = 100

function professorStudentMatchesSearch(
  row: ProfessorStudentRow,
  searchRaw: string
): boolean {
  const needle = searchRaw.trim().toLowerCase()
  if (!needle) return true
  const name = displayProfessorStudentName(
    row.fullName,
    row.studentId
  ).toLowerCase()
  if (name.includes(needle)) return true
  if (row.studentId.toLowerCase().includes(needle)) return true
  return false
}

export type ListStudentsAcrossClassroomsOptions = {
  /** Filtro por nome (ou parte do id); case-insensitive */
  search?: string
  page?: number
  pageSize?: number
}

export type ListStudentsAcrossClassroomsResult = {
  rows: ProfessorStudentRow[]
  total: number
  page: number
  pageSize: number
  error: string | null
}

/** Todos os alunos distintos nas salas do professor, com lista de turmas por aluno. Suporta filtro e paginação. */
export async function listStudentsAcrossClassroomsForProfessor(
  opts?: ListStudentsAcrossClassroomsOptions
): Promise<ListStudentsAcrossClassroomsResult> {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize: PROFESSOR_STUDENTS_DEFAULT_PAGE_SIZE,
      error: access.error,
    }
  }

  const pageSizeRaw = opts?.pageSize ?? PROFESSOR_STUDENTS_DEFAULT_PAGE_SIZE
  const pageSize = Math.min(
    PROFESSOR_STUDENTS_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(pageSizeRaw) || PROFESSOR_STUDENTS_DEFAULT_PAGE_SIZE)
  )
  const pageRaw = opts?.page ?? 1
  const page = Math.max(1, Math.floor(pageRaw) || 1)
  const search = opts?.search?.trim() ?? ""

  let roomList: { id: string; name: string; subject: string }[] = []
  try {
    roomList = await query<{ id: string; name: string; subject: string }>(
      "select id, name, subject from public.classrooms where professor_id = $1 order by name asc",
      [access.userId]
    )
  } catch (e: any) {
    return { rows: [], total: 0, page: 1, pageSize, error: "Erro ao listar salas" }
  }
  if (roomList.length === 0) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize,
      error: null,
    }
  }

  const roomMeta = new Map<string, ProfessorStudentClassroomRef>()
  for (const r of roomList) {
    roomMeta.set(r.id as string, {
      id: r.id as string,
      name: (r.name as string) ?? "",
      subject: (r.subject as string) ?? "",
    })
  }

  const classroomIds = roomList.map((r) => r.id as string)

  let memberRows: { student_id: string; classroom_id: string }[] = []
  try {
    memberRows = await query<{ student_id: string; classroom_id: string }>(
      "select student_id, classroom_id from public.classroom_members where classroom_id = any($1::uuid[])",
      [classroomIds]
    )
  } catch (e: any) {
    return { rows: [], total: 0, page: 1, pageSize, error: "Erro ao listar matriculas" }
  }

  const byStudent = new Map<string, Map<string, ProfessorStudentClassroomRef>>()
  for (const row of memberRows) {
    const sid = row.student_id as string
    const cid = row.classroom_id as string
    const meta = roomMeta.get(cid)
    if (!meta) continue
    let inner = byStudent.get(sid)
    if (!inner) {
      inner = new Map()
      byStudent.set(sid, inner)
    }
    inner.set(cid, meta)
  }

  const studentIds = [...byStudent.keys()]
  if (studentIds.length === 0) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize,
      error: null,
    }
  }

  const CHUNK = 500
  const profiles: { id: string; full_name: string | null }[] = []
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const chunk = studentIds.slice(i, i + CHUNK)
    try {
      const profChunk = await query<{ id: string; full_name: string | null }>(
        "select id, full_name from public.profiles where id = any($1::uuid[])",
        [chunk]
      )
      for (const p of profChunk) {
        profiles.push({ id: p.id, full_name: p.full_name ?? null })
      }
    } catch (e: any) {
      return { rows: [], total: 0, page: 1, pageSize, error: "Erro ao carregar perfis" }
    }
  }

  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]))

  const rows: ProfessorStudentRow[] = studentIds.map((studentId) => {
    const classMap = byStudent.get(studentId)!
    const classrooms = [...classMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    )
    return {
      studentId,
      fullName: nameById.get(studentId) ?? null,
      classrooms,
    }
  })

  rows.sort((a, b) => {
    const na = displayProfessorStudentName(a.fullName, a.studentId).toLocaleLowerCase()
    const nb = displayProfessorStudentName(b.fullName, b.studentId).toLocaleLowerCase()
    return na.localeCompare(nb, "pt-BR")
  })

  const filtered = search
    ? rows.filter((r) => professorStudentMatchesSearch(r, search))
    : rows

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  return {
    rows: pageRows,
    total,
    page: safePage,
    pageSize,
    error: null,
  }
}

export async function getClassroomPreviewByInviteCode(rawCode: string): Promise<{
  preview: ClassroomPreview | null
  error: string | null
}> {
  const code = normalizeInviteCodeInput(rawCode)
  if (!code) return { preview: null, error: null }

  let row: any = null
  try {
    const r = await queryOne<{ id: string; name: string; subject: string; education_level: string; professor_name: string; status: string }>(
      "select * from public.get_classroom_by_invite_code($1)",
      [code]
    )
    row = r
  } catch (e: any) {
    return { preview: null, error: "Erro ao buscar sala" }
  }
  if (!row) return { preview: null, error: null }

  return {
    preview: {
      id: row.id as string,
      name: row.name as string,
      subject: row.subject as string,
      education_level: row.education_level as string,
      professor_name: row.professor_name as string,
      status: row.status as string,
    },
    error: null,
  }
}

export async function removeClassroomMember(
  classroomId: string,
  studentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ok = await assertProfessorOwnsClassroom(classroomId, user.id)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  try {
    await query("delete from public.classroom_members where classroom_id = $1 and student_id = $2", [
      classroomId,
      studentId,
    ])
  } catch (e: any) {
    return { ok: false, error: "Erro ao remover aluno" }
  }
  revalidatePath(`/dashboard/professor/salas/${classroomId}`)
  revalidatePath("/dashboard/professor/salas")
  revalidatePath("/dashboard/professor/alunos")
  return { ok: true }
}

export async function updateClassroomMural(
  classroomId: string,
  description: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ok = await assertProfessorOwnsClassroom(classroomId, user.id)
  if (!ok) return { ok: false, error: "Sala nao encontrada" }

  const trimmed = description.trim()
  if (trimmed.length > MURAL_DESCRIPTION_MAX_CHARS) {
    return {
      ok: false,
      error: `Texto do mural: no maximo ${MURAL_DESCRIPTION_MAX_CHARS} caracteres`,
    }
  }

  try {
    await query(
      "update public.classrooms set description = $1 where id = $2 and professor_id = $3",
      [trimmed || null, classroomId, user.id]
    )
  } catch (e: any) {
    return { ok: false, error: "Erro ao atualizar mural" }
  }
  revalidateClassroomMuralPaths(classroomId)
  return { ok: true }
}

export async function uploadClassroomCover(
  classroomId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }
  if (!(await checkRateLimit(`classroom-cover-upload:${user.id}`, 20, 3600, { failClosed: true }))) {
    return { ok: false, error: "Limite de uploads excedido" }
  }

  const ownerOk = await assertProfessorOwnsClassroom(classroomId, user.id)
  if (!ownerOk) return { ok: false, error: "Sala nao encontrada" }

  const raw = formData.get("file")
  if (!(raw instanceof File) || raw.size === 0) {
    return { ok: false, error: "Selecione uma imagem" }
  }
  if (raw.size > COVER_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: `Imagem muito grande (max ${Math.round(COVER_IMAGE_MAX_BYTES / 1024 / 1024)} MB)`,
    }
  }
  if (!isCoverImageType(raw.type, raw.name)) {
    return {
      ok: false,
      error: "Use JPEG, PNG, GIF ou WebP",
    }
  }

  const row = await queryOne<{ cover_image_pathname: string | null }>(
    "select cover_image_pathname from public.classrooms where id = $1 and professor_id = $2",
    [classroomId, user.id]
  )
  if (!row) return { ok: false, error: "Sala nao encontrada" }
  const previousPathname = row.cover_image_pathname ?? null

  const safe = safeUploadFilename(raw.name)
  const pathname = `classroom-mural/${classroomId}/cover-${randomUUID()}-${safe}`
  const contentType = effectiveContentType(raw)

  try {
    await put(pathname, raw, {
      access: "private",
      token,
      contentType,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no upload"
    return { ok: false, error: msg }
  }

  try {
    await query(
      "update public.classrooms set cover_image_pathname = $1 where id = $2 and professor_id = $3",
      [pathname, classroomId, user.id]
    )
  } catch (e: any) {
    await del(pathname, { token }).catch(() => {})
    return { ok: false, error: "Erro ao salvar capa" }
  }

  if (previousPathname) {
    await del(previousPathname, { token }).catch(() => {})
  }

  revalidateClassroomMuralPaths(classroomId)
  return { ok: true }
}

export async function removeClassroomCover(
  classroomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }
  }

  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const ownerOk = await assertProfessorOwnsClassroom(classroomId, user.id)
  if (!ownerOk) return { ok: false, error: "Sala nao encontrada" }

  const row = await queryOne<{ cover_image_pathname: string | null }>(
    "select cover_image_pathname from public.classrooms where id = $1 and professor_id = $2",
    [classroomId, user.id]
  )
  if (!row) return { ok: false, error: "Sala nao encontrada" }
  const pathname = row.cover_image_pathname ?? null
  if (!pathname) return { ok: true }

  try {
    await query(
      "update public.classrooms set cover_image_pathname = null where id = $1 and professor_id = $2",
      [classroomId, user.id]
    )
  } catch (e: any) {
    return { ok: false, error: "Erro ao remover capa" }
  }

  await del(pathname, { token }).catch(() => {})
  revalidateClassroomMuralPaths(classroomId)
  return { ok: true }
}

export async function leaveClassroom(classroomId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  try {
    await query("delete from public.classroom_members where classroom_id = $1 and student_id = $2", [
      classroomId,
      user.id,
    ])
  } catch (e: any) {
    return { ok: false, error: "Erro ao sair da sala" }
  }
  revalidatePath("/dashboard/aluno/salas")
  return { ok: true }
}

export type ProfessorPendingActivity = {
  classroomId: string
  classroomName: string
  subject: string
  activityId: string
  activityTitle: string
  activityType: string
  enviados: number
  total: number
}

export async function getProfessorPendingActivities(): Promise<{
  activities: ProfessorPendingActivity[]
  error: string | null
}> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { activities: [], error: access.error }

  try {
    const rows = await query<{
      classroom_id: string
      classroom_name: string | null
      subject: string | null
      activity_id: string
      activity_title: string | null
      activity_type: string | null
      total: number
      enviados: number
    }>(
      `SELECT
         c.id            AS classroom_id,
         c.name          AS classroom_name,
         c.subject,
         a.id            AS activity_id,
         a.title         AS activity_title,
         a.type          AS activity_type,
         COUNT(DISTINCT cm.student_id)::int                                        AS total,
         COUNT(DISTINCT s.student_id) FILTER (WHERE s.status = 'enviado')::int     AS enviados
       FROM public.classrooms c
       JOIN public.classroom_activities a
         ON a.classroom_id = c.id AND a.status <> 'rascunho'
       LEFT JOIN public.classroom_members cm ON cm.classroom_id = c.id
       LEFT JOIN public.classroom_activity_submissions s
         ON s.activity_id = a.id
       WHERE c.professor_id = $1
       GROUP BY c.id, c.name, c.subject, a.id, a.title, a.type
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [access.userId]
    )

    const activities: ProfessorPendingActivity[] = (rows ?? []).map((r) => ({
      classroomId: r.classroom_id,
      classroomName: r.classroom_name ?? "Sala",
      subject: r.subject ?? "",
      activityId: r.activity_id,
      activityTitle: r.activity_title ?? "Atividade",
      activityType: r.activity_type ?? "activity",
      enviados: Number(r.enviados),
      total: Number(r.total),
    }))

    return { activities, error: null }
  } catch (e: any) {
    return { activities: [], error: "Erro ao carregar atividades" }
  }
}
