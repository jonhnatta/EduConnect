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
  total: number
  byType: Record<string, number>
  hasMore: boolean
}

const NOTIFICATIONS_PAGE_SIZE = 20

export async function getMyNotifications(
  limit = NOTIFICATIONS_PAGE_SIZE,
  offset = 0
): Promise<NotificationSummary> {
  const user = await requireAuthedUser()

  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit)) || NOTIFICATIONS_PAGE_SIZE), 100)
  const safeOffset = Math.max(0, Math.floor(Number(offset)) || 0)

  // Busca limit+1 para saber se há mais páginas sem um COUNT extra
  const rows = await query<Notification>(
    `SELECT n.id, n.type, n.actor_id, n.entity_id, n.entity_type, n.message,
            n.read_at, n.created_at,
            p.full_name AS actor_name, p.avatar_url AS actor_avatar
       FROM public.notifications n
       LEFT JOIN public.profiles p ON p.id = n.actor_id
      WHERE n.recipient_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3`,
    [user.id, safeLimit + 1, safeOffset]
  )

  const hasMore = (rows?.length ?? 0) > safeLimit
  const notifications = (rows ?? []).slice(0, safeLimit)

  // Contagens reais sobre toda a tabela (não apenas a página)
  const stats = await query<{ type: string; cnt: number; unread: number }>(
    `SELECT type,
            COUNT(*)::int AS cnt,
            COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread
       FROM public.notifications
      WHERE recipient_id = $1
      GROUP BY type`,
    [user.id]
  )

  const byType: Record<string, number> = {}
  let total = 0
  let unreadCount = 0
  for (const s of stats ?? []) {
    byType[s.type] = Number(s.cnt)
    total += Number(s.cnt)
    unreadCount += Number(s.unread)
  }

  return { notifications, unreadCount, total, byType, hasMore }
}

export async function getMyUnreadCount(): Promise<number> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return 0

  const row = await queryOne<{ cnt: number }>(
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
  revalidatePath("/dashboard/aluno", "layout")
  revalidatePath("/dashboard/professor", "layout")
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
  revalidatePath("/dashboard/aluno", "layout")
  revalidatePath("/dashboard/professor", "layout")
  return { ok: true }
}

