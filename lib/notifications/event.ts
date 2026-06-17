import { query } from "@/lib/db/query"

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
      input.message,
    ]
  )
}

/** Notifica todos os seguidores de um professor sobre novo conteúdo publicado. */
export async function notifyFollowersNewContent(input: {
  teacherId: string
  teacherName: string
  entityId: string
  contentTypeLabel: string
  title: string
}): Promise<void> {
  const followers = await query<{ student_id: string }>(
    "SELECT student_id FROM public.teacher_followers WHERE teacher_id = $1",
    [input.teacherId]
  )
  if (!followers?.length) return

  const message = `${input.teacherName} publicou um novo ${input.contentTypeLabel}: "${input.title}"`

  for (const { student_id } of followers) {
    await createNotification({
      recipientId: student_id,
      type: "new_content",
      actorId: input.teacherId,
      entityId: input.entityId,
      entityType: "content_item",
      message,
    })
  }
}
