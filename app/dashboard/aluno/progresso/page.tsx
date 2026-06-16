import Link from "next/link"
import { getPlannerWeek } from "@/app/actions/student-planner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ArrowRight, BookOpen, CalendarCheck2, Flame, Target, Trophy } from "lucide-react"

function percent(done: number, total: number) {
  if (total <= 0) return 0
  return Math.round((done / total) * 100)
}

export default async function AlunoProgressoPage() {
  const planner = await getPlannerWeek()
  const stats = planner.stats
  const personalPct = percent(stats.personalDone, stats.personalTotal)
  const classroomPct = percent(stats.classroomSubmitted, stats.classroomActivitiesInWeek)
  const totalDone = stats.personalDone + stats.classroomSubmitted
  const totalPlanned = stats.personalTotal + stats.classroomActivitiesInWeek
  const overallPct = percent(totalDone, totalPlanned)

  const dayHighlights = planner.days.map((day) => ({
    label: day.weekdayShort,
    total: day.personalItems.length + day.classroomItems.length,
    done:
      day.personalItems.filter((item) => item.isDone).length +
      day.classroomItems.filter((item) => item.submissionStatus === "enviado").length,
  }))

  return (
    <div className="mx-auto max-w-6xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-[#059669]">
            Evolucao do aluno
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Meu Progresso</h1>
          <p className="mt-1 text-sm text-gray-500">
            Uma visao clara do seu ritmo, consistencia e entregas da semana.
          </p>
        </div>
        <Button asChild className="bg-[#10B981] hover:bg-[#059669]">
          <Link href="/dashboard/aluno/plano">Atualizar meu plano</Link>
        </Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <Flame className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Sequencia ativa</p>
              <p className="font-display text-2xl font-bold text-gray-900">{stats.streakDays} dias</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <CalendarCheck2 className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Conclusao geral</p>
              <p className="font-display text-2xl font-bold text-gray-900">{overallPct}%</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <Target className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tarefas pessoais</p>
              <p className="font-display text-2xl font-bold text-gray-900">
                {stats.personalDone}/{stats.personalTotal}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <BookOpen className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Atividades enviadas</p>
              <p className="font-display text-2xl font-bold text-gray-900">
                {stats.classroomSubmitted}/{stats.classroomActivitiesInWeek}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Semana em andamento</CardTitle>
              <CardDescription>Como voce esta distribuindo energia entre metas pessoais e salas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Metas pessoais</span>
                  <span className="font-medium text-gray-900">{personalPct}%</span>
                </div>
                <Progress value={personalPct} className="h-3 bg-emerald-100 [&_[data-slot=progress-indicator]]:bg-[#10B981]" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Atividades de sala</span>
                  <span className="font-medium text-gray-900">{classroomPct}%</span>
                </div>
                <Progress value={classroomPct} className="h-3 bg-emerald-100 [&_[data-slot=progress-indicator]]:bg-[#059669]" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {dayHighlights.map((day) => {
                  const dayPct = percent(day.done, day.total)
                  return (
                    <div key={day.label} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">{day.label}</p>
                        <Badge className="bg-white text-gray-700">{day.done}/{day.total}</Badge>
                      </div>
                      <Progress value={dayPct} className="h-2 bg-emerald-100 [&_[data-slot=progress-indicator]]:bg-[#10B981]" />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Proximos marcos</CardTitle>
              <CardDescription>Mockup de acompanhamento para incentivar continuidade.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Manter ritmo</p>
                <p className="mt-2 text-sm text-gray-600">Chegue a 7 dias seguidos de estudo para consolidar rotina.</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Fechar pendencias</p>
                <p className="mt-2 text-sm text-gray-600">Entregue tudo da semana para destravar recomendacoes melhores.</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Expor evolucao</p>
                <p className="mt-2 text-sm text-gray-600">Use seu perfil publico para mostrar foco e consistencia.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-[#10B981] to-[#059669] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="font-display text-lg">Leitura rapida</CardTitle>
              <CardDescription className="text-emerald-50">
                Um retrato simples do seu momento de estudo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Consistencia</p>
                <p className="mt-2 text-sm font-semibold">
                  {stats.streakDays > 0
                    ? "Voce esta mantendo um ritmo ativo de estudo."
                    : "Ainda da para iniciar uma sequencia hoje."}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Foco da semana</p>
                <p className="mt-2 text-sm font-semibold">
                  {stats.classroomActivitiesInWeek > stats.personalTotal
                    ? "Prioridade nas entregas das salas."
                    : "Equilibrio maior entre rotina pessoal e estudos guiados."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Proximos passos</CardTitle>
              <CardDescription>Atalhos para agir em cima do que o progresso mostrou.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/dashboard/aluno/plano">
                  Revisar plano de estudos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/dashboard/aluno/salas">
                  Abrir minhas salas
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/dashboard/aluno/perfil">
                  Atualizar perfil publico
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Conquista atual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 rounded-2xl bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                  <Trophy className="h-6 w-6 text-[#10B981]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Aluno em movimento</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Mockup de badges futuras para exibir disciplina, entregas e constancia no perfil publico.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
