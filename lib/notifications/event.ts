import { query } from "@/lib/db/query"

const MESSAGE_MAX_LEN = 500

/** Cria uma notificação no banco (não é server action — pode ser chamada de qualquer contexto server). */
export async function createNotification(input: {
  recipientId: string
  type: string
  actorId?: string
  entityId?: string
  entityType?: string
  message: string
}): Promise<void> {
  await query(
    `INSERT INTO public.notifications (recipient_id, type, actor_id, entity_id, entity_type, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.recipientId,
      input.type,
      input.actorId ?? null,
      input.entityId ?? null,
      input.entityType ?? null,
      input.message.slice(0, MESSAGE_MAX_LEN),
    ]
  )
}

/**
 * Notifica todos os seguidores de um professor sobre novo conteúdo publicado.
 * Usa bulk INSERT (1 query em vez de N). Respeita notification_prefs do seguidor.
 * Dedup: não envia se já existe notificação new_content para este entity_id.
 */
export async function notifyFollowersNewContent(input: {
  teacherId: string
  teacherName: string
  entityId: string
  contentTypeLabel: string
  title: string
}): Promise<void> {
  // Dedup: impede reenvio em re-publicação ou double-submit
  const dup = await query<{ id: string }>(
    "SELECT id FROM public.notifications WHERE type = 'new_content' AND entity_id = $1 LIMIT 1",
    [input.entityId]
  )
  if (dup?.length) return

  const message = `${input.teacherName} publicou um novo ${input.contentTypeLabel}: "${input.title}"`.slice(0, MESSAGE_MAX_LEN)

  // Bulk INSERT — 1 query para N seguidores; filtra prefs do seguidor
  await query(
    `INSERT INTO public.notifications (recipient_id, type, actor_id, entity_id, entity_type, message)
     SELECT tf.student_id, 'new_content', $1, $2, 'content_item', $3
       FROM public.teacher_followers tf
       JOIN public.profiles p ON p.id = tf.student_id
      WHERE tf.teacher_id = $1
        AND (p.notification_prefs->>'new_content') IS DISTINCT FROM 'false'`,
    [input.teacherId, input.entityId, message]
  )
}
