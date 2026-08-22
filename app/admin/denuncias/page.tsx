import Link from "next/link"
import { redirect } from "next/navigation"
import { getAdminMfaAccess } from "@/lib/auth/admin"
import { query } from "@/lib/db/query"
import { decideAbuseReport } from "@/app/actions/trust-safety"

type ReportRow = { id: string; target_type: string; target_id: string; category: string; details: string | null; created_at: string; reporter_name: string | null }

export default async function AdminReportsPage() {
  const admin = await getAdminMfaAccess()
  if (!admin) redirect("/admin/mfa")
  const reports = await query<ReportRow>(
    `select r.id, r.target_type, r.target_id, r.category, r.details, r.created_at,
            p.full_name as reporter_name
       from public.abuse_reports r
       left join public.profiles p on p.id = r.reporter_id
      where r.status = 'open'
      order by r.created_at asc limit 100`
  )
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-bold">Denúncias</h1><Link href="/admin/professores" className="text-blue-700">Professores</Link></div>
      <p className="mt-2 text-gray-600">Fila limitada às 100 denúncias abertas mais antigas.</p>
      <div className="mt-6 space-y-4">
        {reports.map((report) => (
          <article key={report.id} className="rounded-xl border bg-white p-5">
            <p className="font-semibold">{report.category} · {report.target_type}</p>
            <p className="text-sm text-gray-500">Alvo: {report.target_id} · denunciante: {report.reporter_name ?? "Conta removida"}</p>
            {report.details && <p className="mt-3 whitespace-pre-wrap">{report.details}</p>}
            {admin.role === "admin" && <form action={decideAbuseReport} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input type="hidden" name="reportId" value={report.id} />
              <input name="resolution" minLength={10} maxLength={2000} required placeholder="Fundamentação da decisão" className="rounded-md border p-2" />
              <button name="decision" value="dismissed" className="rounded-md border px-3 py-2">Arquivar</button>
              <button name="decision" value="suspend" className="rounded-md bg-red-700 px-3 py-2 text-white">Suspender conta</button>
            </form>}
          </article>
        ))}
        {!reports.length && <p className="rounded-xl border bg-white p-6">Nenhuma denúncia aberta.</p>}
      </div>
    </main>
  )
}
