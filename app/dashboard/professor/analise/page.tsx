import Link from "next/link"
import { BarChart3, Users, ClipboardList, TrendingUp, ChevronRight } from "lucide-react"
import { requireApprovedProfessorAccess } from "@/lib/auth/guards"
import { listClassroomsForProfessor } from "@/app/actions/classrooms"
import { getClassroomPerformanceForProfessor } from "@/app/actions/classroom-performance"
import { CopilotClassroomAction } from "@/components/dashboard/copilot-classroom-action"

export const dynamic = "force-dynamic"

function fmt(n: number | null | undefined, d = 1): string {
  return n == null ? "—" : n.toFixed(d)
}

export default async function ProfessorAnalisePage() {
  await requireApprovedProfessorAccess()

  const { rows: classrooms } = await listClassroomsForProfessor()
  const perf = await Promise.all(
    classrooms.map(async (c) => ({
      classroom: c,
      data: await getClassroomPerformanceForProfessor(c.id),
    }))
  )

  const totalStudents = perf.reduce((s, p) => s + p.data.memberCount, 0)
  const totalActivities = perf.reduce((s, p) => s + p.data.evaluativeActivityCount, 0)
  const classAverages = perf
    .map((p) => p.data.classAverageFromStudentAverages)
    .filter((x): x is number => x != null)
  const overallAvg = classAverages.length
    ? classAverages.reduce((a, b) => a + b, 0) / classAverages.length
    : null

  const summary = [
    { label: "Turmas", value: String(classrooms.length), icon: Users },
    { label: "Alunos", value: String(totalStudents), icon: Users },
    { label: "Atividades avaliativas", value: String(totalActivities), icon: ClipboardList },
    { label: "Média geral", value: fmt(overallAvg), icon: TrendingUp },
  ]

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <BarChart3 className="h-5 w-5 text-[#1D4ED8]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Análise de Desempenho</h1>
          <p className="text-sm text-gray-500">Visão consolidada das suas turmas e do rendimento dos alunos</p>
        </div>
      </div>

      {classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-1">Nenhuma turma ainda</p>
          <p className="text-sm text-gray-500 mb-6">
            Crie uma sala e adicione atividades avaliativas para acompanhar o desempenho aqui.
          </p>
          <Link href="/dashboard/professor/salas" className="text-[#1D4ED8] font-medium hover:underline">
            Ir para Minhas Salas
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {summary.map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <s.icon className="h-5 w-5 text-gray-400 mb-2" />
                <div className="font-display text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          <h2 className="font-display font-semibold text-lg text-gray-900 mb-4">Desempenho por turma</h2>
          <div className="space-y-3">
            {perf.map(({ classroom, data }) => {
              const deliveryPct = data.deliveryRate != null ? Math.round(data.deliveryRate * 100) : null
              return (
                <div key={classroom.id} className="space-y-2">
                <Link
                  href={`/dashboard/professor/salas/${classroom.id}`}
                  className="block bg-white rounded-xl border border-gray-100 p-5 hover:border-[#1D4ED8]/30 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{classroom.name}</h3>
                      <p className="text-sm text-gray-500">
                        {data.memberCount} aluno{data.memberCount !== 1 ? "s" : ""} ·{" "}
                        {data.evaluativeActivityCount} atividade{data.evaluativeActivityCount !== 1 ? "s" : ""} avaliativa{data.evaluativeActivityCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-center">
                        <div className="font-display font-bold text-lg text-gray-900">
                          {fmt(data.classAverageFromStudentAverages)}
                        </div>
                        <div className="text-[11px] text-gray-400">média</div>
                      </div>
                      <div className="text-center">
                        <div className="font-display font-bold text-lg text-gray-900">
                          {deliveryPct != null ? `${deliveryPct}%` : "—"}
                        </div>
                        <div className="text-[11px] text-gray-400">entrega</div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-300" />
                    </div>
                  </div>
                </Link>
                <CopilotClassroomAction classroomId={classroom.id} mode="performance" />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
