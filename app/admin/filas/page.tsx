import Link from "next/link"
import { redirect } from "next/navigation"
import { Activity, RefreshCcw, ServerCog } from "lucide-react"
import { getAdminMfaAccess } from "@/lib/auth/admin"
import { query } from "@/lib/db/query"
import { replayDeadLetter } from "@/app/actions/admin-queue-operations"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type QueueCount = { queue_name: string; count: string; oldest: string | null }
type Heartbeat = { service_name: string; status: string; heartbeat_at: string; instance_id: string }
type DeadLetter = { id: string; queue_name: string; job_name: string; attempts: number; last_error: string; failed_at: string; event_id: string | null }

export default async function AdminQueuesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const admin = await getAdminMfaAccess()
  if (!admin) redirect("/admin/mfa")
  const params = await searchParams
  const [pending, heartbeats, deadLetters] = await Promise.all([
    query<QueueCount>(`select queue_name, count(*)::text as count, min(created_at)::text as oldest from public.outbox_events where published_at is null group by queue_name order by queue_name`),
    query<Heartbeat>(`select service_name, status, heartbeat_at::text, instance_id from public.service_heartbeats order by service_name`),
    query<DeadLetter>(`select id, queue_name, job_name, attempts, last_error, failed_at::text, event_id from public.job_dead_letters where replayed_at is null order by failed_at desc limit 100`),
  ])
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-400"><ServerCog /> Operacao restrita</div><h1 className="text-3xl font-bold">Filas e processamento</h1><p className="mt-2 text-slate-400">Backlog, heartbeats e DLQ com replay auditado.</p></div><Button asChild variant="outline"><Link href="/admin/professores">Verificacao de professores</Link></Button></header>
        {params.error ? <p className="rounded-lg bg-red-950 p-4 text-red-200">Nao foi possivel executar o replay.</p> : null}
        {params.success ? <p className="rounded-lg bg-emerald-950 p-4 text-emerald-200">Replay solicitado ao dispatcher.</p> : null}
        <section className="grid gap-4 md:grid-cols-2">
          {heartbeats.map((item) => <Card key={item.service_name} className="border-slate-800 bg-slate-900"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="text-emerald-400" /> {item.service_name}</CardTitle><CardDescription className="text-slate-400">{item.status} em {new Date(item.heartbeat_at).toLocaleString("pt-BR")}</CardDescription></CardHeader><CardContent className="break-all text-xs text-slate-500">{item.instance_id}</CardContent></Card>)}
        </section>
        <section className="space-y-3"><h2 className="text-xl font-bold">Outbox pendente</h2>{pending.length ? pending.map((item) => <div key={item.queue_name} className="flex justify-between rounded-lg border border-slate-800 bg-slate-900 p-4"><span>{item.queue_name}</span><strong>{item.count}</strong></div>) : <p className="text-slate-400">Nenhum evento pendente.</p>}</section>
        <section className="space-y-3"><h2 className="text-xl font-bold">Dead letters ({deadLetters.length})</h2>{deadLetters.length ? deadLetters.map((item) => <Card key={item.id} className="border-red-950 bg-slate-900"><CardHeader><CardTitle>{item.queue_name} / {item.job_name}</CardTitle><CardDescription className="text-slate-400">{item.attempts} tentativas, {new Date(item.failed_at).toLocaleString("pt-BR")}</CardDescription></CardHeader><CardContent className="space-y-4"><pre className="whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-red-200">{item.last_error}</pre><form action={replayDeadLetter}><input type="hidden" name="deadLetterId" value={item.id} /><Button disabled={!item.event_id} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"><RefreshCcw /> Reprocessar</Button></form></CardContent></Card>) : <p className="text-slate-400">DLQ vazia.</p>}</section>
      </div>
    </main>
  )
}
