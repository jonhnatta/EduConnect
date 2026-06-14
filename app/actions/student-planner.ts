"use server"

import { revalidatePath } from "next/cache"
import {
  addDays,
  eachDayOfInterval,
  format,
  isValid,
  parseISO,
  startOfWeek,
  subDays,
} from "date-fns"
import { requireAuthedUser } from "@/lib/auth/user"
import { query, queryOne } from "@/lib/db/query"
import { parseExamFromSettings } from "@/lib/activities/exam"
import type { ClassroomActivityRow } from "@/lib/activities/types"
import type {
  ClassroomPlannerItem,
  PersonalPlannerTask,
  PlannerDayColumn,
  PlannerWeekPayload,
} from "@/lib/student-planner/types"
import {
  STREAK_TIMEZONE,
  computeCurrentStreak,
  nowLocalDateIso,
  toLocalDateIso,
} from "@/lib/student-planner/streak"

const PLAN_PATH = "/dashboard/aluno/plano"
const STREAK_LOOKBACK_DAYS = 400

async function computePlannerStreakDays(
  studentId: string
): Promise<number> {
  const cutoff = subDays(new Date(), STREAK_LOOKBACK_DAYS).toISOString()

  const [personalRows, subRows] = await Promise.all([
    query<{ done_at: string | null }>(
      `select done_at
       from public.student_planner_personal_tasks
       where student_id = $1
         and is_done = true
         and done_at is not null
         and done_at >= $2`,
      [studentId, cutoff]
    ).catch(() => []),
    query<{ submitted_at: string | null }>(
      `select submitted_at
       from public.classroom_activity_submissions
       where student_id = $1
         and status = 'enviado'
         and submitted_at is not null
         and submitted_at >= $2`,
      [studentId, cutoff]
    ).catch(() => []),
  ])

  const activeDays = new Set<string>()
  for (const r of personalRows ?? []) {
    const t = r.done_at
    if (t) activeDays.add(toLocalDateIso(t, STREAK_TIMEZONE))
  }
  for (const r of subRows ?? []) {
    const t = r.submitted_at
    if (t) activeDays.add(toLocalDateIso(t, STREAK_TIMEZONE))
  }

  return computeCurrentStreak(activeDays, nowLocalDateIso(STREAK_TIMEZONE))
}

function toWeekMonday(input: string | undefined): Date {
  if (!input?.trim()) {
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  }
  const d = parseISO(input.trim())
  if (!isValid(d)) return startOfWeek(new Date(), { weekStartsOn: 1 })
  return startOfWeek(d, { weekStartsOn: 1 })
}

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

function activityCalendarDate(
  dueAt: string | null,
  startsAt: string | null
): string | null {
  const raw = dueAt ?? startsAt
  if (!raw) return null
  try {
    return format(parseISO(raw), "yyyy-MM-dd")
  } catch {
    return null
  }
}

const WEEKDAY_SHORT_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

export async function getPlannerWeek(
  weekStartIso?: string
): Promise<PlannerWeekPayload> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) {
    return {
      weekStartIso: "",
      weekEndIso: "",
      days: [],
      undatedClassroomItems: [],
      evaluativeWeekItems: [],
      stats: {
        personalDone: 0,
        personalTotal: 0,
        classroomActivitiesInWeek: 0,
        classroomSubmitted: 0,
        streakDays: 0,
      },
      error: "Nao autenticado",
    }
  }

  const profile = await queryOne<{ user_type: string }>(
    "select user_type from public.profiles where id = $1",
    [user.id]
  )

  if (profile?.user_type !== "aluno") {
    return {
      weekStartIso: "",
      weekEndIso: "",
      days: [],
      undatedClassroomItems: [],
      evaluativeWeekItems: [],
      stats: {
        personalDone: 0,
        personalTotal: 0,
        classroomActivitiesInWeek: 0,
        classroomSubmitted: 0,
        streakDays: 0,
      },
      error: "Apenas alunos",
    }
  }

  const streakDays = await computePlannerStreakDays(user.id)

  const monday = toWeekMonday(weekStartIso)
  const sunday = addDays(monday, 6)
  const weekStartStr = isoDate(monday)
  const weekEndStr = isoDate(sunday)

  let members: { classroom_id: string }[] = []
  try {
    members =
      (await query<{ classroom_id: string }>(
        "select classroom_id from public.classroom_members where student_id = $1",
        [user.id]
      )) ?? []
  } catch (e: any) {
    return {
      weekStartIso: weekStartStr,
      weekEndIso: weekEndStr,
      days: [],
      undatedClassroomItems: [],
      evaluativeWeekItems: [],
      stats: {
        personalDone: 0,
        personalTotal: 0,
        classroomActivitiesInWeek: 0,
        classroomSubmitted: 0,
        streakDays,
      },
      error: e?.message ?? "Erro ao carregar salas",
    }
  }

  const classroomIds = (members ?? []).map((m) => m.classroom_id)
  const roomMeta = new Map<
    string,
    { name: string; subject: string }
  >()

  if (classroomIds.length > 0) {
    const rooms = await query<{ id: string; name: string | null; subject: string | null }>(
      "select id, name, subject from public.classrooms where id = any($1::uuid[])",
      [classroomIds]
    ).catch(() => [])

    for (const r of rooms ?? []) {
      roomMeta.set(r.id, {
        name: r.name ?? "Sala",
        subject: r.subject ?? "",
      })
    }
  }

  let activities: ClassroomActivityRow[] = []
  if (classroomIds.length > 0) {
    const actRows = await query<ClassroomActivityRow>(
      `select *
       from public.classroom_activities
       where classroom_id = any($1::uuid[])
         and status <> 'rascunho'
       order by due_at asc nulls last`,
      [classroomIds]
    ).catch((e: any) => ({ __err: e }))

    if ((actRows as any)?.__err) {
      const e = (actRows as any).__err as any
      return {
        weekStartIso: weekStartStr,
        weekEndIso: weekEndStr,
        days: [],
        undatedClassroomItems: [],
        evaluativeWeekItems: [],
        stats: {
          personalDone: 0,
          personalTotal: 0,
          classroomActivitiesInWeek: 0,
          classroomSubmitted: 0,
          streakDays,
        },
        error: e?.message ?? "Erro ao carregar atividades",
      }
    }
    activities = (actRows as any) ?? []
  }

  const activityIds = activities.map((a) => a.id)
  const submissionByActivity = new Map<string, "rascunho" | "enviado">()
  if (activityIds.length > 0) {
    const subs = await query<{ activity_id: string; status: string }>(
      `select activity_id, status
       from public.classroom_activity_submissions
       where student_id = $1
         and activity_id = any($2::uuid[])`,
      [user.id, activityIds]
    ).catch(() => [])

    for (const s of subs ?? []) {
      const aid = s.activity_id
      const st = s.status
      if (st === "rascunho" || st === "enviado") {
        submissionByActivity.set(aid, st)
      }
    }
  }

  const undated: ClassroomPlannerItem[] = []
  const byDate = new Map<string, ClassroomPlannerItem[]>()

  for (const act of activities) {
    const meta = roomMeta.get(act.classroom_id)
    const roomName = meta?.name ?? "Sala"
    const subject = meta?.subject ?? ""
    const href = `/dashboard/aluno/salas/${act.classroom_id}/atividades/${act.id}`
    const sub = submissionByActivity.get(act.id) ?? null

    const isEvaluative = parseExamFromSettings(act.settings) != null

    const item: ClassroomPlannerItem = {
      kind: "classroom",
      activityId: act.id,
      classroomId: act.classroom_id,
      classroomName: roomName,
      subject,
      activityTitle: act.title,
      activityType: act.type,
      dueAt: act.due_at,
      startsAt: act.starts_at,
      href,
      submissionStatus: sub,
      isEvaluative,
    }

    const dk = activityCalendarDate(act.due_at, act.starts_at)
    if (dk == null) {
      undated.push(item)
      continue
    }

    if (dk < weekStartStr || dk > weekEndStr) {
      continue
    }

    const list = byDate.get(dk) ?? []
    list.push(item)
    byDate.set(dk, list)
  }

  let personalRows: Record<string, unknown>[] = []
  try {
    personalRows =
      (await query<Record<string, unknown>>(
        `select *
         from public.student_planner_personal_tasks
         where student_id = $1
           and scheduled_on >= $2::date
           and scheduled_on <= $3::date
         order by scheduled_on asc`,
        [user.id, weekStartStr, weekEndStr]
      )) ?? []
  } catch (e: any) {
    return {
      weekStartIso: weekStartStr,
      weekEndIso: weekEndStr,
      days: [],
      undatedClassroomItems: undated,
      evaluativeWeekItems: [],
      stats: {
        personalDone: 0,
        personalTotal: 0,
        classroomActivitiesInWeek: 0,
        classroomSubmitted: 0,
        streakDays,
      },
      error: e?.message ?? "Erro",
    }
  }

  const personalByDate = new Map<string, PersonalPlannerTask[]>()
  const personalList: PersonalPlannerTask[] = []
  for (const row of personalRows ?? []) {
    // pg returns date columns as Date objects; normalize to YYYY-MM-DD string
    const raw = row.scheduled_on
    const scheduledOnIso =
      raw instanceof Date ? format(raw, "yyyy-MM-dd") : String(raw).slice(0, 10)
    const t: PersonalPlannerTask = {
      kind: "personal",
      id: row.id as string,
      title: row.title as string,
      notes: (row.notes as string | null) ?? null,
      scheduledOn: scheduledOnIso,
      isDone: Boolean(row.is_done),
      doneAt:
        typeof row.done_at === "string" ? row.done_at : null,
    }
    personalList.push(t)
    const list = personalByDate.get(scheduledOnIso) ?? []
    list.push(t)
    personalByDate.set(scheduledOnIso, list)
  }

  const dayInterval = eachDayOfInterval({ start: monday, end: sunday })
  const days: PlannerDayColumn[] = dayInterval.map((d) => {
    const dateIso = isoDate(d)
    const dow = d.getDay()
    return {
      dateIso,
      weekdayShort: WEEKDAY_SHORT_PT[dow] ?? "",
      dayOfMonth: d.getDate(),
      classroomItems: byDate.get(dateIso) ?? [],
      personalItems: personalByDate.get(dateIso) ?? [],
    }
  })

  let classroomInWeek = 0
  let classroomSubmitted = 0
  for (const [, list] of byDate) {
    for (const it of list) {
      classroomInWeek += 1
      if (it.submissionStatus === "enviado") classroomSubmitted += 1
    }
  }

  const personalDone = personalList.filter((t) => t.isDone).length
  const personalTotal = personalList.length

  const evaluativeWeekItems: ClassroomPlannerItem[] = []
  for (const col of days) {
    for (const it of col.classroomItems) {
      if (it.isEvaluative) evaluativeWeekItems.push(it)
    }
  }
  for (const it of undated) {
    if (it.isEvaluative) evaluativeWeekItems.push(it)
  }
  evaluativeWeekItems.sort((a, b) => {
    const da = activityCalendarDate(a.dueAt, a.startsAt) ?? "9999-12-31"
    const db = activityCalendarDate(b.dueAt, b.startsAt) ?? "9999-12-31"
    if (da !== db) return da.localeCompare(db)
    return a.activityTitle.localeCompare(b.activityTitle, "pt-BR")
  })

  return {
    weekStartIso: weekStartStr,
    weekEndIso: weekEndStr,
    days,
    undatedClassroomItems: undated,
    evaluativeWeekItems,
    stats: {
      personalDone,
      personalTotal,
      classroomActivitiesInWeek: classroomInWeek,
      classroomSubmitted,
      streakDays,
    },
    error: null,
  }
}

export async function createPersonalPlannerTask(input: {
  title: string
  notes?: string
  scheduledOn: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Titulo obrigatorio" }

  const scheduled = input.scheduledOn.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled)) {
    return { ok: false, error: "Data invalida" }
  }

  try {
    const data = await queryOne<{ id: string }>(
      `insert into public.student_planner_personal_tasks
         (student_id, title, notes, scheduled_on, is_done)
       values ($1, $2, $3, $4::date, false)
       returning id`,
      [user.id, title, input.notes?.trim() || null, scheduled]
    )
    if (!data) return { ok: false, error: "Erro" }
    revalidatePath(PLAN_PATH)
    return { ok: true, id: data.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro" }
  }
}

export async function updatePersonalPlannerTask(
  id: string,
  input: { title?: string; notes?: string | null; scheduledOn?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const sets: string[] = []
  const params: unknown[] = [id, user.id]
  let p = params.length

  if (input.title !== undefined) {
    sets.push(`title = $${++p}`)
    params.push(input.title.trim())
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${++p}`)
    params.push(input.notes)
  }
  if (input.scheduledOn !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledOn)) {
      return { ok: false, error: "Data invalida" }
    }
    sets.push(`scheduled_on = $${++p}::date`)
    params.push(input.scheduledOn)
  }

  if (sets.length === 0) return { ok: true }

  try {
    await query(
      `update public.student_planner_personal_tasks
       set ${sets.join(", ")}
       where id = $1 and student_id = $2`,
      params
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro" }
  }
  revalidatePath(PLAN_PATH)
  return { ok: true }
}

export async function deletePersonalPlannerTask(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  try {
    await query(
      "delete from public.student_planner_personal_tasks where id = $1 and student_id = $2",
      [id, user.id]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro" }
  }
  revalidatePath(PLAN_PATH)
  return { ok: true }
}

export async function togglePersonalPlannerTaskDone(
  id: string,
  isDone: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const doneAt = isDone ? new Date().toISOString() : null

  try {
    await query(
      `update public.student_planner_personal_tasks
       set is_done = $3,
           done_at = $4
       where id = $1 and student_id = $2`,
      [id, user.id, isDone, doneAt]
    )
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro" }
  }
  revalidatePath(PLAN_PATH)
  return { ok: true }
}

export async function getOnboardingStatus(): Promise<{ completed: boolean }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { completed: false }

  const row = await queryOne<{ student_id: string }>(
    "select student_id from public.student_onboarding_answers where student_id = $1",
    [user.id]
  ).catch(() => null)

  return { completed: row != null }
}

export async function saveOnboardingAnswers(answers: {
  objetivo: string
  tempo: string
  dificuldades: string[]
  estilo: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  try {
    await query(
      `insert into public.student_onboarding_answers
         (student_id, goal, daily_time, difficult_subjects, learning_style, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (student_id) do update
         set goal               = excluded.goal,
             daily_time         = excluded.daily_time,
             difficult_subjects = excluded.difficult_subjects,
             learning_style     = excluded.learning_style,
             updated_at         = now()`,
      [user.id, answers.objetivo, answers.tempo, answers.dificuldades, answers.estilo]
    )
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro ao salvar" }
  }
}
