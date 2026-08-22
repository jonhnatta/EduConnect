"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getAdminMfaAccess } from "@/lib/auth/admin"
import { withTransaction } from "@/lib/db/transaction"

const schema = z.object({
  professorId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "revoked"]),
  reason: z.string().trim().min(10).max(1000),
  subjects: z.array(z.string().trim().min(1).max(60)).max(20),
})

export async function decideProfessorVerification(formData: FormData): Promise<void> {
  const admin = await getAdminMfaAccess()
  if (!admin) redirect("/admin/mfa")
  const parsed = schema.safeParse({
    professorId: formData.get("professorId"),
    decision: formData.get("decision"),
    reason: formData.get("reason"),
    subjects: formData.getAll("subjects"),
  })
  if (!parsed.success) redirect("/admin/professores?error=dados-invalidos")

  const { professorId, decision, reason, subjects } = parsed.data
  if (decision === "revoked" && admin.role !== "admin") {
    redirect("/admin/professores?error=permissao-insuficiente")
  }
  try {
    await withTransaction(async (client) => {
      const result = await client.query<{
        professor_verification_status: string
        professor_verification_doc_status: string
      }>(
        `select professor_verification_status, professor_verification_doc_status
           from public.profiles
          where id = $1 and user_type = 'professor'
          for update`,
        [professorId]
      )
      const profile = result.rows[0]
      if (!profile) throw new Error("Professor nao encontrado")
      if (decision === "approved") {
        if (profile.professor_verification_status !== "pending") {
          throw new Error("Apenas solicitacoes pendentes podem ser aprovadas")
        }
        if (profile.professor_verification_doc_status !== "clean") {
          throw new Error("Documento ainda nao foi liberado pelo scan")
        }
        if (!subjects.length) throw new Error("Selecione ao menos uma disciplina")
      }
      if (decision === "rejected" && profile.professor_verification_status !== "pending") {
        throw new Error("Apenas solicitacoes pendentes podem ser rejeitadas")
      }
      if (decision === "revoked" && profile.professor_verification_status !== "approved") {
        throw new Error("Apenas aprovacoes ativas podem ser revogadas")
      }

      await client.query(
        `update public.profiles
            set professor_verification_status = $2,
                professor_verification_reviewed_at = timezone('utc'::text, now()),
                professor_verification_rejection_reason = case when $2 = 'approved' then null else $3 end,
                professor_approved_subjects = case when $2 = 'approved' then $4::text[] else null end
          where id = $1`,
        [professorId, decision, reason, subjects]
      )
      await client.query(
        `insert into public.professor_verification_reviews
           (professor_id, reviewer_id, decision, previous_status, reason, approved_subjects)
         values ($1, $2, $3, $4, $5, $6::text[])`,
        [professorId, admin.userId, decision, profile.professor_verification_status, reason, subjects]
      )
      await client.query(
        `insert into public.admin_audit_events
           (admin_user_id, action, target_type, target_id, metadata)
         values ($1, 'professor.verification.decided', 'profile', $2,
                 jsonb_build_object('decision', $3))`,
        [admin.userId, professorId, decision]
      )
      const message =
        decision === "approved"
          ? "Sua verificacao de professor foi aprovada."
          : decision === "revoked"
            ? "Sua verificacao de professor foi revogada. Consulte o suporte."
            : "O documento enviado nao foi aprovado. Consulte o motivo e envie uma nova evidencia."
      await client.query(
        `insert into public.notifications
           (recipient_id, type, actor_id, entity_id, entity_type, message)
         values ($1, 'review_result', $2, $1, 'profile', $3)
         on conflict (recipient_id, type, entity_id) where entity_id is not null
         do update set message = excluded.message, actor_id = excluded.actor_id,
                       read_at = null, created_at = timezone('utc'::text, now())`,
        [professorId, admin.userId, message]
      )
    })
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin.professor_verification.failed",
      adminUserId: admin.userId,
      professorId,
      message: error instanceof Error ? error.message : String(error),
    }))
    redirect("/admin/professores?error=decisao-rejeitada")
  }

  revalidatePath("/admin/professores")
  revalidatePath("/dashboard/professor")
  redirect("/admin/professores?success=1")
}
