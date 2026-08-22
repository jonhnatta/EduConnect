"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAuthedUser } from "@/lib/auth/user"
import { getAdminMfaAccess } from "@/lib/auth/admin"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { queryOne } from "@/lib/db/query"
import { withTransaction } from "@/lib/db/transaction"

const reportSchema = z.object({
  targetType: z.enum(["profile", "content_item"]),
  targetId: z.string().uuid(),
  category: z.enum(["harassment", "hate", "sexual", "violence", "fraud", "copyright", "privacy", "other"]),
  details: z.string().trim().max(2000),
  returnTo: z.string().max(500).optional(),
})

function safeReturnTo(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard/aluno"
}

export async function submitAbuseReport(formData: FormData): Promise<void> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) redirect("/login")
  const parsed = reportSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    category: formData.get("category"),
    details: formData.get("details") ?? "",
    returnTo: formData.get("returnTo") ?? undefined,
  })
  if (!parsed.success) redirect("/denunciar?error=dados-invalidos")
  const returnTo = safeReturnTo(parsed.data.returnTo)
  if (!(await checkRateLimit(`abuse-report:${user.id}`, 10, 24 * 60 * 60, { failClosed: true }))) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}report=limit`)
  }

  const targetExists = parsed.data.targetType === "profile"
    ? await queryOne<{ ok: boolean }>(
        `select exists (select 1 from public.profiles where id = $1 and deleted_at is null and id <> $2) as ok`,
        [parsed.data.targetId, user.id]
      )
    : await queryOne<{ ok: boolean }>(
        "select public.user_can_view_content_item($1::uuid, $2::uuid) as ok",
        [parsed.data.targetId, user.id]
      )
  if (!targetExists?.ok) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}report=not-found`)

  await withTransaction(async (client) => {
    await client.query(
      `insert into public.abuse_reports (reporter_id, target_type, target_id, category, details)
       values ($1, $2, $3, $4, nullif($5, ''))
       on conflict (reporter_id, target_type, target_id) where status = 'open'
       do update set category = excluded.category, details = excluded.details, created_at = timezone('utc'::text, now())`,
      [user.id, parsed.data.targetType, parsed.data.targetId, parsed.data.category, parsed.data.details]
    )
  })
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}report=sent`)
}

const decisionSchema = z.object({
  reportId: z.string().uuid(),
  decision: z.enum(["dismissed", "suspend"]),
  resolution: z.string().trim().min(10).max(2000),
})

export async function decideAbuseReport(formData: FormData): Promise<void> {
  const admin = await getAdminMfaAccess()
  if (!admin) redirect("/admin/mfa")
  if (admin.role !== "admin") redirect("/admin/denuncias?error=forbidden")
  const parsed = decisionSchema.safeParse({
    reportId: formData.get("reportId"),
    decision: formData.get("decision"),
    resolution: formData.get("resolution"),
  })
  if (!parsed.success) redirect("/admin/denuncias?error=dados-invalidos")

  await withTransaction(async (client) => {
    const result = await client.query<{ target_type: string; target_id: string }>(
      "select target_type, target_id from public.abuse_reports where id = $1 and status = 'open' for update",
      [parsed.data.reportId]
    )
    const report = result.rows[0]
    if (!report) throw new Error("Denuncia indisponivel")
    let suspendedUserId: string | null = null
    if (parsed.data.decision === "suspend") {
      if (report.target_type === "profile") {
        suspendedUserId = report.target_id
      } else {
        const owner = await client.query<{ author_id: string }>(
          "select author_id from public.content_items where id = $1",
          [report.target_id]
        )
        suspendedUserId = owner.rows[0]?.author_id ?? null
      }
      if (!suspendedUserId) throw new Error("Alvo nao encontrado")
      await client.query(
        `update public.profiles
            set account_status = 'suspended',
                profile_visibility = 'private',
                professor_verification_status = case
                  when professor_verification_status = 'approved' then 'revoked'
                  else professor_verification_status
                end
          where id = $1`,
        [suspendedUserId]
      )
      await client.query("update public.users set session_version = session_version + 1 where id = $1", [suspendedUserId])
      await client.query("update public.content_items set status = 'draft' where author_id = $1 and status = 'published'", [suspendedUserId])
      await client.query(
        "update public.classrooms set is_public = false, status = 'encerrada' where professor_id = $1",
        [suspendedUserId]
      )
    }
    await client.query(
      `update public.abuse_reports
          set status = $2, reviewed_by = $3, resolution = $4,
              reviewed_at = timezone('utc'::text, now())
        where id = $1`,
      [parsed.data.reportId, parsed.data.decision === "suspend" ? "actioned" : "dismissed", admin.userId, parsed.data.resolution]
    )
    await client.query(
      `insert into public.admin_audit_events (admin_user_id, action, target_type, target_id, metadata)
       values ($1, 'trust_safety.report_decided', 'abuse_report', $2,
               jsonb_build_object('decision', $3, 'suspendedUserId', $4))`,
      [admin.userId, parsed.data.reportId, parsed.data.decision, suspendedUserId]
    )
  })
  revalidatePath("/admin/denuncias")
  redirect("/admin/denuncias?success=1")
}
