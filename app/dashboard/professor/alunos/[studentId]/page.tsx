import Link from "next/link"
import { notFound } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronLeft } from "lucide-react"
import { requireProfessorAccess } from "@/lib/auth/guards"
import { getProfessorStudentOverview } from "@/app/actions/classroom-performance"
import { AlunoPerformancePanel } from "@/components/dashboard/aluno-performance-panel"
import { displayProfessorStudentName } from "@/lib/classrooms/professor-students-display"
import { Button } from "@/components/ui/button"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function ProfessorAlunoDetalhePage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  await requireProfessorAccess()

  const { studentId } = await params
  if (!UUID_RE.test(studentId)) notFound()

  const overview = await getProfessorStudentOverview(studentId)

  const title = displayProfessorStudentName(overview.fullName, overview.studentId)

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-4" asChild>
          <Link href="/dashboard/professor/alunos">
            <ChevronLeft className="h-4 w-4" />
            Meus Alunos
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-600 mt-1">
          Desempenho nas suas turmas em que este aluno esta matriculado.
        </p>
      </div>

      {overview.error && overview.classrooms.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {overview.error}
        </div>
      ) : null}

      {overview.classrooms.map((c) => (
        <section key={c.classroomId} className="mb-10 last:mb-0">
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold text-gray-900">
              <Link
                href={`/dashboard/professor/salas/${c.classroomId}`}
                className="text-[#1D4ED8] hover:underline underline-offset-2"
              >
                {c.name}
              </Link>
            </h2>
            <p className="text-sm text-gray-600">
              {c.subject}
              {c.educationLevel ? ` · ${c.educationLevel}` : ""}
            </p>
            {c.joinedAt ? (
              <p className="text-xs text-gray-400 mt-1">
                Matriculado em{" "}
                {format(new Date(c.joinedAt), "d 'de' MMMM yyyy", {
                  locale: ptBR,
                })}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm">
            <AlunoPerformancePanel
              data={c.performance}
              audience="professor"
            />
          </div>
        </section>
      ))}
    </div>
  )
}
