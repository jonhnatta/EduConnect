"use server"

import { query, queryOne } from "@/lib/db/query"
import { getAuthedUser, requireAuthedUser } from "@/lib/auth/user"
import { createNotification } from "@/lib/notifications/event"

type FollowState = {
  following: boolean
  followersCount: number
}

async function resolveTeacherId(teacherIdOrSlug: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id
       FROM public.profiles
      WHERE user_type = 'professor'
        AND (id::text = $1 OR lower(slug) = lower($1))
      LIMIT 1`,
    [teacherIdOrSlug]
  )
  return row?.id ?? null
}

async function getAlunoId(): Promise<string | null> {
  const user = await getAuthedUser().catch(() => null)
  if (!user) return null
  const row = await queryOne<{ user_type: string }>(
    "SELECT user_type FROM public.profiles WHERE id = $1",
    [user.id]
  )
  if (row?.user_type !== "aluno") return null
  return user.id
}

export async function getFollowState(teacherIdOrSlug: string): Promise<FollowState> {
  const user = await getAuthedUser().catch(() => null)
  const teacherId = await resolveTeacherId(teacherIdOrSlug)
  if (!teacherId) return { following: false, followersCount: 0 }

  const countRow = await queryOne<{ followers_count: string }>(
    "SELECT followers_count FROM public.profiles WHERE id = $1",
    [teacherId]
  )
  const followersCount = Number(countRow?.followers_count ?? 0)

  if (!user) return { following: false, followersCount }

  const exists = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.teacher_followers
       WHERE teacher_id = $1 AND student_id = $2
     ) AS exists`,
    [teacherId, user.id]
  )

  return { following: exists?.exists === true, followersCount }
}

export async function toggleFollow(
  teacherId: string
): Promise<{ ok: true; following: boolean; followersCount: number } | { ok: false; error: string }> {
  const studentId = await getAlunoId()
  if (!studentId) return { ok: false, error: "Apenas alunos podem seguir professores" }
  if (studentId === teacherId) return { ok: false, error: "Operação inválida" }

  const teacher = await queryOne<{ user_type: string }>(
    "SELECT user_type FROM public.profiles WHERE id = $1",
    [teacherId]
  )
  if (teacher?.user_type !== "professor") return { ok: false, error: "Professor não encontrado" }

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM public.teacher_followers WHERE teacher_id = $1 AND student_id = $2",
    [teacherId, studentId]
  )

  if (existing) {
    await query(
      "DELETE FROM public.teacher_followers WHERE teacher_id = $1 AND student_id = $2",
      [teacherId, studentId]
    )
  } else {
    await query(
      "INSERT INTO public.teacher_followers (teacher_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [teacherId, studentId]
    )
    const studentRow = await queryOne<{ full_name: string | null }>(
      "SELECT full_name FROM public.profiles WHERE id = $1",
      [studentId]
    )
    const name = studentRow?.full_name?.trim() || "Um aluno"
    await createNotification({
      recipientId: teacherId,
      type: "new_follower",
      actorId: studentId,
      message: `${name} começou a te seguir`,
    }).catch(() => {})
  }

  const updated = await queryOne<{ followers_count: string }>(
    "SELECT followers_count FROM public.profiles WHERE id = $1",
    [teacherId]
  )

  return {
    ok: true,
    following: !existing,
    followersCount: Number(updated?.followers_count ?? 0),
  }
}

export type FollowerItem = {
  id: string
  full_name: string
  avatar_url: string | null
  slug: string | null
  followed_at: string
}

export async function getMyFollowers(): Promise<FollowerItem[]> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return []

  const rows = await query<FollowerItem>(
    `SELECT p.id, p.full_name, p.avatar_url, p.slug, tf.created_at AS followed_at
       FROM public.teacher_followers tf
       JOIN public.profiles p ON p.id = tf.student_id
      WHERE tf.teacher_id = $1
      ORDER BY tf.created_at DESC`,
    [user.id]
  )
  return rows ?? []
}

export type FollowingItem = {
  id: string
  full_name: string
  avatar_url: string | null
  slug: string | null
  followed_at: string
}

export async function getMyFollowing(): Promise<FollowingItem[]> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return []

  const rows = await query<FollowingItem>(
    `SELECT p.id, p.full_name, p.avatar_url, p.slug, tf.created_at AS followed_at
       FROM public.teacher_followers tf
       JOIN public.profiles p ON p.id = tf.teacher_id
      WHERE tf.student_id = $1
      ORDER BY tf.created_at DESC`,
    [user.id]
  )
  return rows ?? []
}

export async function getProfileSocialStats(
  userId: string,
  userType: "aluno" | "professor"
): Promise<{ followersCount: number; followingCount: number }> {
  if (userType === "professor") {
    const row = await queryOne<{ followers_count: string }>(
      "SELECT followers_count FROM public.profiles WHERE id = $1",
      [userId]
    )
    return { followersCount: Number(row?.followers_count ?? 0), followingCount: 0 }
  }

  const row = await queryOne<{ cnt: string }>(
    "SELECT COUNT(*)::int AS cnt FROM public.teacher_followers WHERE student_id = $1",
    [userId]
  )
  return { followersCount: 0, followingCount: Number(row?.cnt ?? 0) }
}
