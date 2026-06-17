import { NextResponse } from "next/server"
import { query } from "@/lib/db/query"

/**
 * LGPD Art. 18 — Hard-delete de contas marcadas há mais de 30 dias.
 * Chamar via cron job (ex.: Vercel Cron ou pg_cron).
 * Protegido por CRON_SECRET no header x-cron-secret.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Deleta users referenciados pelos profiles a expirar;
  // a FK profiles.id -> users.id garante que profiles também é removido (cascade ou direto).
  const deleted = await query<{ id: string }>(
    `WITH to_delete AS (
       SELECT id FROM public.profiles
       WHERE deleted_at IS NOT NULL
         AND deleted_at < now() - INTERVAL '30 days'
     ),
     del_profiles AS (
       DELETE FROM public.profiles WHERE id IN (SELECT id FROM to_delete) RETURNING id
     )
     DELETE FROM public.users WHERE id IN (SELECT id FROM to_delete) RETURNING id`
  )

  const count = deleted?.length ?? 0
  console.log(`[cron/purge-deleted-accounts] Removidas ${count} contas`)
  return NextResponse.json({ deleted: count })
}
