"use server"

import { revalidatePath } from "next/cache"
import { query, queryOne } from "@/lib/db/query"
import { requireAuthedUser } from "@/lib/auth/user"

export type Notification = {
  id: string
  type: string
  actor_id: string | null
  actor_name: string | null
  actor_avatar: string | null
  entity_id: string | null
  entity_type: string | null
  message: string
  read_at: string | null
  created_at: string
}

export type NotificationSummary = {
  notifications: Notification[]
  unreadCount: number
}

export async function getMyNotifications(limit = 50): Promise<NotificationSummary> {
  const user = await requireAuthedUser()

  const notifications = await query<Notification>(
    `SELECT n.id, n.type, n.actor_id, n.entity_id, n.entity_type, n.message,
            n.read_at, n.created_at,
            p.full_name AS actor_name, p.avatar_url AS actor_avatar
       FROM public.notifications n
       LEFT JOIN public.profiles p ON p.id = n.actor_id
      WHERE n.recipient_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2`,
    [user.id, limit]
  )

  const countRow = await queryOne<{ cnt: string }>(
    "SELECT COUNT(*)::int AS cnt FROM public.notifications WHERE recipient_id = $1 AND read_at IS NULL",
    [user.id]
  )

  return {
    notifications: notifications ?? [],
    unreadCount: Number(countRow?.cnt ?? 0),
  }
}

export async function getMyUnreadCount(): Promise<number> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return 0

  const row = await queryOne<{ cnt: string }>(
    "SELECT COUNT(*)::int AS cnt FROM public.notifications WHERE recipient_id = $1 AND read_at IS NULL",
    [user.id]
  )
  return Number(row?.cnt ?? 0)
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ ok: boolean }> {
  const user = await requireAuthedUser()

  await query(
    "UPDATE public.notifications SET read_at = now() WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL",
    [notificationId, user.id]
  )

  revalidatePath("/dashboard/aluno/notificacoes")
  revalidatePath("/dashboard/professor/notificacoes")
  return { ok: true }
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await requireAuthedUser()

  await query(
    "UPDATE public.notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL",
    [user.id]
  )

  revalidatePath("/dashboard/aluno/notificacoes")
  revalidatePath("/dashboard/professor/notificacoes")
  return { ok: true }
}

