import Link from "next/link"
import { Suspense } from "react"
import { requireProfessorAccess } from "@/lib/auth/guards"
import { listStudentsAcrossClassroomsForProfessor } from "@/app/actions/classrooms"
import { ProfessorAlunosSearchBar } from "@/components/dashboard/professor-alunos-search"
import { displayProfessorStudentName } from "@/lib/classrooms/professor-students-display"
import { Button } from "@/components/ui/button"
import { BookOpen, ChevronLeft, ChevronRight, UsersRound } from "lucide-react"

const PAGE_SIZE = 25

function buildQueryString(
  sp: {
    q?: string
    page?: string
    status?: string
  },
  patch: { q?: string; page?: number }
): string {
  const p = new URLSearchParams()
  const q = patch.q !== undefined ? patch.q : sp.q
  const page = patch.page !== undefined ? patch.page : Number(sp.page) || 1
  if (q?.trim()) p.set("q", q.trim())
  if (sp.status) p.set("status", sp.status)
  p.set("page", String(Math.max(1, page)))
  const s = p.toString()
  return s ? `?${s}` : "?"
}

export default async function ProfessorAlunosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>
}) {
  await requireProfessorAccess()

  const sp = await searchParams
  const isPendente = sp.status === "pendente"
  const q = typeof sp.q === "string" ? sp.q : ""
  const pageRaw = parseInt(sp.page ?? "1", 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1

  const result = await listStudentsAcrossClassroomsForProfessor({
    search: q,
    page,
    pageSize: PAGE_SIZE,
  })

  const { rows, total, error } = result
  const currentPage = result.page
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const to = Math.min(currentPage * PAGE_SIZE, total)

  const spForHref = { q: q || undefined, page: String(currentPage), status: sp.status }

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Meus Alunos
          </h1>
          <p className="text-gray-600">
            Alunos matriculados em pelo menos uma das suas turmas
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="mb-6 h-10 max-w-xl rounded-lg bg-gray-100 animate-pulse" />
        }
      >
        <ProfessorAlunosSearchBar initialQuery={q} />
      </Suspense>

      {isPendente && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Seu cadastro de professor ainda esta em analise. A listagem reflete
          apenas dados ja disponiveis na sua conta.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}. Se ainda nao aplicou o SQL das salas, execute{" "}
          <code className="font-mono text-xs">scripts/002_classrooms.sql</code>{" "}
          no Postgres.
        </div>
      )}

      {!error && total === 0 && !q.trim() && (
        <div className="bg-white border text-center border-dashed border-gray-300 rounded-xl p-12 mt-4">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <UsersRound className="h-8 w-8 text-[#1D4ED8]" />
          </div>
          <h3 className="font-display font-semibold text-xl text-gray-900 mb-2">
            Nenhum aluno encontrado
          </h3>
          <p className="text-gray-500 mb-2 max-w-md mx-auto">
            Quando os alunos entrarem nas suas salas pelo codigo de convite,
            eles aparecerao aqui com as turmas em que estao matriculados.
          </p>
          <p className="text-sm text-gray-400">
            Crie salas em{" "}
            <Link
              href="/dashboard/professor/salas"
              className="text-[#1D4ED8] underline-offset-2 hover:underline"
            >
              Minhas Salas
            </Link>{" "}
            e compartilhe o codigo com a turma.
          </p>
        </div>
      )}

      {!error && total === 0 && q.trim() && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-600">
          Nenhum aluno corresponde a &quot;{q.trim()}&quot;. Tente outro trecho do
          nome.
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left font-display font-semibold text-gray-900 px-4 py-3">
                    Aluno
                  </th>
                  <th className="text-left font-display font-semibold text-gray-900 px-4 py-3 min-w-[240px]">
                    Turmas
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.studentId}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/dashboard/professor/alunos/${row.studentId}`}
                        className="font-medium text-gray-900 hover:text-[#1D4ED8] hover:underline underline-offset-2"
                      >
                        {displayProfessorStudentName(
                          row.fullName,
                          row.studentId
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        {row.classrooms.map((c) => (
                          <Link
                            key={c.id}
                            href={`/dashboard/professor/salas/${c.id}`}
                            className="inline-flex flex-col items-start gap-0.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#1D4ED8] hover:bg-blue-50/60"
                          >
                            <span className="font-medium text-gray-900 leading-tight">
                              {c.name}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <BookOpen className="h-3 w-3 shrink-0" />
                              {c.subject}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500">
            <span>
              {total === 0
                ? "0 alunos"
                : `Mostrando ${from}–${to} de ${total} aluno${
                    total !== 1 ? "s" : ""
                  } unico${total !== 1 ? "s" : ""}`}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <Link
                      href={buildQueryString(spForHref, {
                        page: currentPage - 1,
                      })}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1" disabled>
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                )}
                <span className="px-2 text-sm text-gray-600 tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                {currentPage < totalPages ? (
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <Link
                      href={buildQueryString(spForHref, {
                        page: currentPage + 1,
                      })}
                    >
                      Proxima
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1" disabled>
                    Proxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
