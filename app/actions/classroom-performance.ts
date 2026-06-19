"use server"

import { requireAuthedUser } from "@/lib/auth/user"
import { getProfessorActionAccess, getApprovedProfessorActionAccess } from "@/lib/auth/guards"
import { query, queryOne } from "@/lib/db/query"
import { parseExamFromSettings } from "@/lib/activities/exam"
import type { ClassroomActivityRow } from "@/lib/activities/types"
import type {
  ActivityPerformanceSummary,
  ClassroomPerformanceForProfessor,
  ProfessorStudentOverview,
  SelfActivityPerformance,
  StudentAverageHistogramBin,
  StudentPerformanceRow,
  StudentSelfPerformance,
} from "@/lib/classrooms/performance"

const DEFAULT_STUDENTS_PAGE = 1
const DEFAULT_STUDENTS_PAGE_SIZE = 25
const MAX_STUDENTS_PAGE_SIZE = 100

function buildStudentAverageHistogram(
  rows: StudentPerformanceRow[]
): StudentAverageHistogramBin[] {
  const avgs = rows
    .map((s) => s.averageScore)
    .filter((x): x is number => x != null && !Number.isNaN(x))
  if (avgs.length === 0) return []

  const min = Math.min(...avgs)
  const max = Math.max(...avgs)
  const n = avgs.length
  const binCount = n >= 10 ? 10 : Math.max(3, n)

  if (Math.abs(max - min) < 1e-9) {
    return [{ label: min.toFixed(1), count: avgs.length }]
  }

  const step = (max - min) / binCount
  const bins: StudentAverageHistogramBin[] = []
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * step
    const hi = i === binCount - 1 ? max : min + (i + 1) * step
    const label =
      i === binCount - 1
        ? `${lo.toFixed(1)}–${hi.toFixed(1)}`
        : `${lo.toFixed(1)}–${(min + (i + 1) * step).toFixed(1)}`
    const count = avgs.filter((a) => {
      if (i === binCount - 1) return a >= lo && a <= hi + 1e-9
      return a >= lo && a < hi
    }).length
    bins.push({ label, count })
  }
  return bins
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

function isScoredSubmission(
  row: { status: string; score_total: unknown }
): row is { status: "enviado"; score_total: number } {
  return (
    row.status === "enviado" &&
    row.score_total !== null &&
    row.score_total !== undefined &&
    !Number.isNaN(Number(row.score_total))
  )
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function scoreToPercent(score: number, maxScore: number | null): number | null {
  if (maxScore == null || maxScore <= 0) return null
  return (score / maxScore) * 100
}

function filterEvaluativeActivities(rows: ClassroomActivityRow[]): ClassroomActivityRow[] {
  return rows.filter(
    (a) =>
      a.status !== "rascunho" && parseExamFromSettings(a.settings) != null
  )
}

export async function getClassroomPerformanceForProfessor(
  classroomId: string,
  opts?: { studentsPage?: number; studentsPageSize?: number }
): Promise<ClassroomPerformanceForProfessor> {
  const emptyProf = (
    err: string | null
  ): ClassroomPerformanceForProfessor => ({
    evaluativeActivityCount: 0,
    memberCount: 0,
    classAverageFromStudentAverages: null,
    globalAverageScore: null,
    deliveryRate: null,
    activities: [],
    students: [],
    studentsTotal: 0,
    studentsPage: DEFAULT_STUDENTS_PAGE,
    studentsPageSize: DEFAULT_STUDENTS_PAGE_SIZE,
    studentAverageHistogram: [],
    error: err,
  })

  const access = await getProfessorActionAccess()
  if (!access.ok) return emptyProf(access.error)

  const ok = await assertProfessorOwnsClassroom(classroomId, access.userId)
  if (!ok) {
    return emptyProf("Sala nao encontrada")
  }

  let actRows: ClassroomActivityRow[] = []
  try {
    actRows =
      (await query<ClassroomActivityRow>(
        "select * from public.classroom_activities where classroom_id = $1 order by due_at asc nulls last",
        [classroomId]
      )) ?? []
  } catch (e: any) {
    return emptyProf("Erro ao carregar atividades")
  }

  const activities = filterEvaluativeActivities(actRows)
  const evalIds = activities.map((a) => a.id)
  const evalCount = activities.length

  let memberRows: { student_id: string; joined_at: string | null }[] = []
  try {
    memberRows =
      (await query<{ student_id: string; joined_at: string | null }>(
        "select student_id, joined_at from public.classroom_members where classroom_id = $1 order by joined_at asc",
        [classroomId]
      )) ?? []
  } catch (e: any) {
    return {
      ...emptyProf("Erro ao carregar membros"),
      evaluativeActivityCount: evalCount,
    }
  }

  const members = memberRows ?? []
  const memberCount = members.length

  const studentIds = members.map((m) => m.student_id as string)
  let nameById = new Map<string, string | null>()
  if (studentIds.length > 0) {
    const profs = await query<{ id: string; full_name: string | null }>(
      "select id, full_name from public.profiles where id = any($1::uuid[])",
      [studentIds]
    ).catch(() => [])
    nameById = new Map(
      (profs ?? []).map((p) => [p.id, p.full_name])
    )
  }

  if (evalIds.length === 0) {
    const fullRows: StudentPerformanceRow[] = studentIds.map((id) => ({
      studentId: id,
      studentName: nameById.get(id) ?? null,
      averageScore: null,
      averagePercent: null,
      gradedCount: 0,
      evaluativeActivityCount: 0,
      lastSubmittedAt: null,
    }))
    fullRows.sort((a, b) =>
      (a.studentName ?? "").localeCompare(b.studentName ?? "")
    )
    const pageSize = Math.min(
      MAX_STUDENTS_PAGE_SIZE,
      Math.max(1, opts?.studentsPageSize ?? DEFAULT_STUDENTS_PAGE_SIZE)
    )
    const total = fullRows.length
    const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1)
    const studentsPage = Math.min(
      Math.max(1, opts?.studentsPage ?? DEFAULT_STUDENTS_PAGE),
      maxPage
    )
    const start = (studentsPage - 1) * pageSize
    return {
      evaluativeActivityCount: 0,
      memberCount,
      classAverageFromStudentAverages: null,
      globalAverageScore: null,
      deliveryRate: null,
      activities: [],
      students: fullRows.slice(start, start + pageSize),
      studentsTotal: total,
      studentsPage,
      studentsPageSize: pageSize,
      studentAverageHistogram: [],
      error: null,
    }
  }

  let subRows: {
    activity_id: string
    student_id: string
    status: string
    score_total: unknown
    submitted_at: string | null
  }[] = []
  try {
    subRows =
      (await query<{
        activity_id: string
        student_id: string
        status: string
        score_total: unknown
        submitted_at: string | null
      }>(
        "select activity_id, student_id, status, score_total, submitted_at from public.classroom_activity_submissions where activity_id = any($1::uuid[])",
        [evalIds]
      )) ?? []
  } catch (e: any) {
    return {
      ...emptyProf("Erro ao carregar entregas"),
      evaluativeActivityCount: evalCount,
      memberCount,
    }
  }

  const subs = subRows ?? []
  const allScores: number[] = []
  for (const s of subs) {
    if (isScoredSubmission(s)) {
      allScores.push(Number(s.score_total))
    }
  }
  const globalAverageScore = mean(allScores)

  const activitySummaries: ActivityPerformanceSummary[] = []
  for (const act of activities) {
    const maxScore =
      act.max_score != null && act.max_score > 0 ? act.max_score : null
    const forAct = subs.filter((s) => s.activity_id === act.id)
    const scored = forAct.filter(isScoredSubmission)
    const scores = scored.map((s) => Number(s.score_total))
    const avgScore = mean(scores)
    const percents = scores
      .map((sc) => scoreToPercent(sc, maxScore))
      .filter((p): p is number => p != null)
    const avgPercent = mean(percents)

    activitySummaries.push({
      activityId: act.id,
      title: act.title,
      maxScore,
      memberCount,
      submittedScoredCount: scored.length,
      averageScore: avgScore,
      averagePercent: avgPercent,
    })
  }

  const studentRows: StudentPerformanceRow[] = []
  const studentAverages: number[] = []

  for (const sid of studentIds) {
    const grades: number[] = []
    const percents: number[] = []
    let lastIso: string | null = null

    for (const act of activities) {
      const maxScore =
        act.max_score != null && act.max_score > 0 ? act.max_score : null
      const row = subs.find(
        (s) =>
          s.student_id === sid &&
          s.activity_id === act.id &&
          isScoredSubmission(s)
      )
      if (row && isScoredSubmission(row)) {
        const sc = Number(row.score_total)
        grades.push(sc)
        const p = scoreToPercent(sc, maxScore)
        if (p != null) percents.push(p)
        const subAt = row.submitted_at
        if (typeof subAt === "string") {
          if (!lastIso || subAt > lastIso) lastIso = subAt
        }
      }
    }

    const averageScore = mean(grades)
    const averagePercent = mean(percents)
    if (averageScore != null) studentAverages.push(averageScore)

    studentRows.push({
      studentId: sid,
      studentName: nameById.get(sid) ?? null,
      averageScore,
      averagePercent,
      gradedCount: grades.length,
      evaluativeActivityCount: evalCount,
      lastSubmittedAt: lastIso,
    })
  }

  studentRows.sort((a, b) => {
    const av = b.averageScore ?? -1
    const au = a.averageScore ?? -1
    if (av !== au) return av - au
    return (a.studentName ?? "").localeCompare(b.studentName ?? "")
  })

  const classAverageFromStudentAverages = mean(studentAverages)

  const totalSlots = memberCount * evalCount
  const scoredSlots = subs.filter(isScoredSubmission).length
  const deliveryRate =
    totalSlots > 0 ? scoredSlots / totalSlots : null

  const histogram = buildStudentAverageHistogram(studentRows)
  const pageSize = Math.min(
    MAX_STUDENTS_PAGE_SIZE,
    Math.max(1, opts?.studentsPageSize ?? DEFAULT_STUDENTS_PAGE_SIZE)
  )
  const total = studentRows.length
  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1)
  const studentsPage = Math.min(
    Math.max(1, opts?.studentsPage ?? DEFAULT_STUDENTS_PAGE),
    maxPage
  )
  const start = (studentsPage - 1) * pageSize
  const students = studentRows.slice(start, start + pageSize)

  return {
    evaluativeActivityCount: evalCount,
    memberCount,
    classAverageFromStudentAverages,
    globalAverageScore,
    deliveryRate,
    activities: activitySummaries,
    students,
    studentsTotal: total,
    studentsPage,
    studentsPageSize: pageSize,
    studentAverageHistogram: histogram,
    error: null,
  }
}

type RpcStatRow = { activity_id: string; avg_score: number; score_count: number }

/**
 * Desempenho do aluno (studentId) numa sala — medias da turma via RPC 007.
 * Usado pelo proprio aluno ou pelo professor da sala.
 */
async function loadStudentSelfPerformanceForClassroom(
  classroomId: string,
  studentId: string
): Promise<StudentSelfPerformance> {
  let actRows: ClassroomActivityRow[] = []
  try {
    actRows =
      (await query<ClassroomActivityRow>(
        "select * from public.classroom_activities where classroom_id = $1 order by due_at asc nulls last",
        [classroomId]
      )) ?? []
  } catch (e: any) {
    return {
      evaluativeActivityCount: 0,
      myOverallAverage: null,
      myOverallPercent: null,
      classOverallAverage: null,
      activities: [],
      error: "Erro ao carregar atividades",
    }
  }

  const activities = filterEvaluativeActivities(actRows)
  const evalIds = activities.map((a) => a.id)

  if (evalIds.length === 0) {
    return {
      evaluativeActivityCount: 0,
      myOverallAverage: null,
      myOverallPercent: null,
      classOverallAverage: null,
      activities: [],
      error: null,
    }
  }

  let mySubs: {
    activity_id: string
    status: string
    score_total: unknown
    submitted_at: string | null
  }[] = []
  try {
    mySubs =
      (await query<{
        activity_id: string
        status: string
        score_total: unknown
        submitted_at: string | null
      }>(
        "select activity_id, status, score_total, submitted_at from public.classroom_activity_submissions where student_id = $1 and activity_id = any($2::uuid[])",
        [studentId, evalIds]
      )) ?? []
  } catch (e: any) {
    return {
      evaluativeActivityCount: evalIds.length,
      myOverallAverage: null,
      myOverallPercent: null,
      classOverallAverage: null,
      activities: [],
      error: "Erro ao carregar suas entregas",
    }
  }

  // Media e contagem por atividade avaliativa (turma inteira).
  let rpcRows: RpcStatRow[] = []
  let rpcErr: { message: string } | null = null
  try {
    rpcRows =
      (await query<RpcStatRow>(
        `select
           s.activity_id,
           avg(s.score_total)::numeric as avg_score,
           count(*)::bigint as score_count
         from public.classroom_activity_submissions s
         inner join public.classroom_activities ca on ca.id = s.activity_id
         where ca.classroom_id = $1
           and ca.status <> 'rascunho'
           and ca.settings ? 'exam'
           and s.status = 'enviado'
           and s.score_total is not null
         group by s.activity_id`,
        [classroomId]
      )) ?? []
  } catch (e: any) {
    rpcErr = { message: "Erro" }
  }

  const statsByActivity = new Map<string, { avg: number; count: number }>()
  if (!rpcErr) {
    for (const row of rpcRows ?? []) {
      if (row.activity_id && row.avg_score != null) {
        statsByActivity.set(row.activity_id, {
          avg: Number(row.avg_score),
          count: Number(row.score_count ?? 0),
        })
      }
    }
  }

  const myScores: number[] = []
  const myPercents: number[] = []
  const classAvgs: number[] = []

  const selfActivities: SelfActivityPerformance[] = []

  for (const act of activities) {
    const maxScore =
      act.max_score != null && act.max_score > 0 ? act.max_score : null
    const row = (mySubs ?? []).find((s) => s.activity_id === act.id)
    const myScore =
      row && isScoredSubmission(row) ? Number(row.score_total) : null
    const myPercent =
      myScore != null && maxScore != null
        ? scoreToPercent(myScore, maxScore)
        : null
    if (myScore != null) myScores.push(myScore)
    if (myPercent != null) myPercents.push(myPercent)

    const stat = statsByActivity.get(act.id)
    const classAverageScore = stat?.avg ?? null
    let classAveragePercent: number | null = null
    if (classAverageScore != null && maxScore != null && maxScore > 0) {
      classAveragePercent = scoreToPercent(classAverageScore, maxScore)
    }
    if (classAverageScore != null) classAvgs.push(classAverageScore)

    let comparison: SelfActivityPerformance["comparison"] = null
    if (myScore != null && classAverageScore != null) {
      const eps = 0.01
      if (myScore > classAverageScore + eps) comparison = "above"
      else if (myScore < classAverageScore - eps) comparison = "below"
      else comparison = "equal"
    }

    const submittedAt =
      row && typeof row.submitted_at === "string" ? row.submitted_at : null

    selfActivities.push({
      activityId: act.id,
      title: act.title,
      maxScore,
      myScore,
      myPercent,
      classAverageScore,
      classAveragePercent,
      comparison,
      submittedAt,
    })
  }

  const myOverallAverage = mean(myScores)
  const myOverallPercent = mean(myPercents)
  const classOverallAverage = mean(classAvgs.filter((x) => !Number.isNaN(x)))

  return {
    evaluativeActivityCount: evalIds.length,
    myOverallAverage,
    myOverallPercent,
    classOverallAverage: classAvgs.length > 0 ? classOverallAverage : null,
    activities: selfActivities,
    error: rpcErr
      ? `Medias da turma indisponiveis (aplique scripts/007 ou verifique RPC): ${rpcErr.message}`
      : null,
  }
}

export async function getMyPerformanceInClassroom(
  classroomId: string
): Promise<StudentSelfPerformance> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) {
    return {
      evaluativeActivityCount: 0,
      myOverallAverage: null,
      myOverallPercent: null,
      classOverallAverage: null,
      activities: [],
      error: "Nao autenticado",
    }
  }

  const member = await assertStudentMember(classroomId, user.id)
  if (!member) {
    return {
      evaluativeActivityCount: 0,
      myOverallAverage: null,
      myOverallPercent: null,
      classOverallAverage: null,
      activities: [],
      error: "Voce nao participa desta sala",
    }
  }

  return loadStudentSelfPerformanceForClassroom(classroomId, user.id)
}

/** Professor: desempenho de um aluno nas salas em que ambos coincidem (so suas turmas). */
export async function getProfessorStudentOverview(
  studentId: string
): Promise<ProfessorStudentOverview> {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) {
    return {
      studentId,
      fullName: null,
      classrooms: [],
      error: access.error,
    }
  }

  let rooms: {
    id: string
    name: string | null
    subject: string | null
    education_level: string | null
  }[] = []
  try {
    rooms =
      (await query<{
        id: string
        name: string | null
        subject: string | null
        education_level: string | null
      }>(
        "select id, name, subject, education_level from public.classrooms where professor_id = $1 order by name asc",
        [access.userId]
      )) ?? []
  } catch (e: any) {
    return {
      studentId,
      fullName: null,
      classrooms: [],
      error: "Erro ao carregar salas",
    }
  }

  const roomIds = rooms.map((r) => r.id)
  if (roomIds.length === 0) {
    return {
      studentId,
      fullName: null,
      classrooms: [],
      error: "Voce ainda nao tem turmas. Crie uma em Minhas Salas para ver alunos.",
    }
  }

  let memberRows: { classroom_id: string; joined_at: string | null }[] = []
  try {
    memberRows =
      (await query<{ classroom_id: string; joined_at: string | null }>(
        "select classroom_id, joined_at from public.classroom_members where student_id = $1 and classroom_id = any($2::uuid[])",
        [studentId, roomIds]
      )) ?? []
  } catch (e: any) {
    return {
      studentId,
      fullName: null,
      classrooms: [],
      error: "Erro ao carregar membros",
    }
  }

  const rows = memberRows ?? []
  if (rows.length === 0) {
    return {
      studentId,
      fullName: null,
      classrooms: [],
      error: "Este aluno nao esta em nenhuma das suas turmas",
    }
  }

  const joinedByClass = new Map<string, string | null>()
  for (const m of rows) {
    joinedByClass.set(m.classroom_id as string, (m.joined_at as string) ?? null)
  }

  const studentProfile = await queryOne<{ full_name: string | null }>(
    "select full_name from public.profiles where id = $1",
    [studentId]
  )

  const fullName = studentProfile?.full_name ?? null

  const classrooms: ProfessorStudentOverview["classrooms"] = []

  for (const room of rooms) {
    const cid = room.id
    if (!joinedByClass.has(cid)) continue

    const performance = await loadStudentSelfPerformanceForClassroom(
      cid,
      studentId
    )

    classrooms.push({
      classroomId: cid,
      name: room.name ?? "",
      subject: room.subject ?? "",
      educationLevel: room.education_level ?? "",
      joinedAt: joinedByClass.get(cid) ?? null,
      performance,
    })
  }

  return {
    studentId,
    fullName,
    classrooms,
    error: null,
  }
}
