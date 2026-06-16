"use server"

import { query, queryOne } from "@/lib/db/query"
import { getProfessorActionAccess } from "@/lib/auth/guards"

/**
 * Professor cuja verificação automática foi reprovada ('rejected') pode pedir
 * análise humana. Move para 'pending' marcando manual_requested_at — é esse
 * conjunto que o relatório diário (scripts/reports) entrega para os revisores.
 */
export async function requestManualVerification(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const row = await queryOne<{ professor_verification_status: string | null }>(
    "select professor_verification_status from public.profiles where id = $1",
    [access.userId]
  )
  if (row?.professor_verification_status !== "rejected") {
    return { ok: false, error: "Solicitação de análise manual indisponível no momento." }
  }

  await query(
    `update public.profiles
       set professor_verification_status = 'pending',
           professor_verification_manual_requested_at = timezone('utc'::text, now())
     where id = $1 and professor_verification_status = 'rejected'`,
    [access.userId]
  )

  return { ok: true }
}
