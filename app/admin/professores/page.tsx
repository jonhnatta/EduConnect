import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from "lucide-react"
import { getAdminMfaAccess } from "@/lib/auth/admin"
import { query } from "@/lib/db/query"
import { decideProfessorVerification } from "@/app/actions/admin-professor-verification"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type ProfessorRow = {
  id: string
  full_name: string | null
  email: string
  interests: string[] | null
  professor_verification_status: string
  professor_verification_doc_status: string
  professor_verification_submitted_at: string | null
}

async function professorRows(statuses: string[]) {
  return query<ProfessorRow>(
    `select p.id, p.full_name, u.email, p.interests, p.professor_verification_status,
            p.professor_verification_doc_status, p.professor_verification_submitted_at
       from public.profiles p
       join public.users u on u.id = p.id
      where p.user_type = 'professor'
        and p.professor_verification_status = any($1::text[])
      order by p.professor_verification_submitted_at asc nulls last`,
    [statuses]
  )
}

function ReviewCard({ professor, approved = false }: { professor: ProfessorRow; approved?: boolean }) {
  const subjects = professor.interests ?? []
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{professor.full_name?.trim() || "Professor sem nome"}</span>
          <span className={`rounded-full px-3 py-1 text-xs ${professor.professor_verification_doc_status === "clean" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            documento: {professor.professor_verification_doc_status}
          </span>
        </CardTitle>
        <CardDescription>{professor.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {subjects.length ? subjects.map((subject) => <span key={subject} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{subject}</span>) : <span className="text-sm text-slate-500">Nenhuma disciplina declarada.</span>}
        </div>
        <Button asChild variant="outline" disabled={professor.professor_verification_doc_status !== "clean"}>
          <Link href={`/api/admin/professor-document?professorId=${professor.id}`} target="_blank">
            Abrir documento <ExternalLink />
          </Link>
        </Button>
        <form action={decideProfessorVerification} className="space-y-4">
          <input type="hidden" name="professorId" value={professor.id} />
          {!approved ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Disciplinas comprovadas</legend>
              <div className="flex flex-wrap gap-3">
                {subjects.map((subject) => (
                  <label key={subject} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="subjects" value={subject} defaultChecked /> {subject}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <Textarea name="reason" required minLength={10} maxLength={1000} placeholder={approved ? "Motivo documentado para revogacao" : "Motivo da decisao, evidencias verificadas ou pendencias"} />
          <div className="flex flex-wrap gap-2">
            {!approved ? (
              <>
                <Button name="decision" value="approved" disabled={professor.professor_verification_doc_status !== "clean"} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 /> Aprovar</Button>
                <Button name="decision" value="rejected" variant="destructive"><XCircle /> Rejeitar</Button>
              </>
            ) : (
              <Button name="decision" value="revoked" variant="destructive"><XCircle /> Revogar selo</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default async function AdminProfessoresPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const admin = await getAdminMfaAccess()
  if (!admin) redirect("/admin/mfa")
  const params = await searchParams
  const [pending, approved] = await Promise.all([professorRows(["pending"]), professorRows(["approved"])])
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700"><ShieldCheck /> Backoffice protegido por MFA</div><h1 className="text-3xl font-bold">Verificacao de professores</h1><p className="mt-2 text-slate-600">Revisor: {admin.email} ({admin.role})</p></div>
          <div className="flex gap-2"><Button asChild variant="outline"><Link href="/admin/filas">Operar filas</Link></Button><Button asChild variant="outline"><Link href="/">Voltar ao produto</Link></Button></div>
        </header>
        {params.error ? <p className="rounded-lg bg-red-100 p-4 text-red-800">A decisao foi recusada. Revise estado, scan, disciplinas e motivo.</p> : null}
        {params.success ? <p className="rounded-lg bg-emerald-100 p-4 text-emerald-800">Decisao registrada com auditoria.</p> : null}
        <section className="space-y-4"><h2 className="text-xl font-bold">Fila pendente ({pending.length})</h2>{pending.length ? <div className="grid gap-5 lg:grid-cols-2">{pending.map((professor) => <ReviewCard key={professor.id} professor={professor} />)}</div> : <p className="text-slate-500">Nenhuma solicitacao pendente.</p>}</section>
        <section className="space-y-4"><h2 className="text-xl font-bold">Selos ativos ({approved.length})</h2>{approved.length ? <div className="grid gap-5 lg:grid-cols-2">{approved.map((professor) => <ReviewCard key={professor.id} professor={professor} approved />)}</div> : <p className="text-slate-500">Nenhum professor aprovado.</p>}</section>
      </div>
    </main>
  )
}
