"use client"

import { getClassroomPerformanceForProfessor } from "@/app/actions/classroom-performance"
import type { ClassroomPerformanceForProfessor } from "@/lib/classrooms/performance"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useCallback, useEffect, useState, useTransition } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertCircle, BarChart2, ChevronLeft, ChevronRight, TrendingUp, Users } from "lucide-react"

function fmtNum(n: number | null, d = 1): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toFixed(d)
}

function shortTitle(s: string, max = 22): string {
  const t = s.trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

type Props = {
  classroomId: string
  initialData: ClassroomPerformanceForProfessor
}

export function ClassroomPerformancePanel({
  classroomId,
  initialData,
}: Props) {
  const [data, setData] = useState(initialData)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A server refresh is authoritative over paginated local data.
    setData(initialData)
  }, [initialData])

  const loadPage = useCallback(
    (page: number) => {
      startTransition(async () => {
        const next = await getClassroomPerformanceForProfessor(classroomId, {
          studentsPage: page,
          studentsPageSize: data.studentsPageSize,
        })
        if (!next.error) setData(next)
      })
    },
    [classroomId, data.studentsPageSize]
  )

  if (data.error) {
    return (
      <div className="p-6 text-sm text-red-600 flex items-start gap-2">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
        {data.error}
      </div>
    )
  }

  const { evaluativeActivityCount, memberCount } = data

  if (evaluativeActivityCount === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm max-w-md mx-auto">
        <p className="mb-2 text-gray-700 font-medium">
          Ainda nao ha atividades avaliativas com prova nesta sala
        </p>
        <p>
          Crie atividades com questoes (prova objetiva ou lista) e publique-as.
          As medias aparecem apos os alunos enviarem e as notas estarem
          fechadas.
        </p>
      </div>
    )
  }

  const byActivityChart = data.activities.map((a) => ({
    key: a.activityId,
    nome: shortTitle(a.title),
    titulo: a.title,
    media: a.averageScore ?? 0,
    pct: a.averagePercent ?? 0,
  }))

  const histogramChart = data.studentAverageHistogram.map((b, i) => ({
    key: `bin-${i}`,
    faixa: b.label,
    n: b.count,
  }))

  const deliveryPct =
    data.deliveryRate != null ? (data.deliveryRate * 100).toFixed(0) : null

  const totalPages = Math.max(
    1,
    Math.ceil(data.studentsTotal / data.studentsPageSize) || 1
  )
  const canPrev = data.studentsPage > 1
  const canNext = data.studentsPage < totalPages

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <p className="text-xs text-gray-500 max-w-3xl">
        Medias calculadas sobre entregas com nota final (
        <code className="text-[11px] bg-gray-50 px-1 rounded">enviado</code> e
        score). Media geral da turma: media das medias individuais (so alunos
        com pelo menos uma nota). A tabela de alunos esta paginada (
        {data.studentsPageSize} por pagina) para nao sobrecarregar o navegador;
        graficos usam agregados (atividade e distribuicao de medias).
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="h-4 w-4" />
            Media da turma
          </div>
          <p className="font-display text-2xl font-bold text-[#1D4ED8] tabular-nums">
            {fmtNum(data.classAverageFromStudentAverages)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Sobre notas numericas</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <BarChart2 className="h-4 w-4" />
            Atividades avaliativas
          </div>
          <p className="font-display text-2xl font-bold text-gray-900 tabular-nums">
            {evaluativeActivityCount}
          </p>
          <p className="text-xs text-gray-400 mt-1">Com prova estruturada</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Users className="h-4 w-4" />
            Taxa de entrega
          </div>
          <p className="font-display text-2xl font-bold text-gray-900 tabular-nums">
            {deliveryPct != null ? `${deliveryPct}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Notas fechadas / ({memberCount} alunos × {evaluativeActivityCount}{" "}
            atividades)
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <h3 className="font-display font-semibold text-gray-900 mb-4 text-sm">
            Media por atividade (nota)
          </h3>
          <div className="h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byActivityChart} margin={{ bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [fmtNum(v), "Media"]}
                  labelFormatter={(_, payload) =>
                    (payload?.[0]?.payload as { titulo?: string })?.titulo ??
                    ""
                  }
                />
                <Bar dataKey="media" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <h3 className="font-display font-semibold text-gray-900 mb-1 text-sm">
            Distribuicao das medias dos alunos
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Faixas de nota media (todos os alunos com pelo menos uma nota).
            Agregado fixo — nao depende da pagina da tabela.
          </p>
          {histogramChart.length === 0 || histogramChart.every((x) => x.n === 0) ? (
            <p className="text-sm text-gray-500 py-12 text-center">
              Nenhuma media individual ainda.
            </p>
          ) : (
            <div className="h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogramChart} margin={{ bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" />
                  <XAxis dataKey="faixa" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, "Alunos"]} />
                  <Bar dataKey="n" fill="#93C5FD" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <h3 className="font-display font-semibold text-gray-900 text-sm">
            Alunos ({data.studentsTotal} total)
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canPrev || pending}
              onClick={() => loadPage(data.studentsPage - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs text-gray-600 tabular-nums px-2">
              Pagina {data.studentsPage} de {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canNext || pending}
              onClick={() => loadPage(data.studentsPage + 1)}
              className="gap-1"
            >
              Seguinte
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium tabular-nums">Media</th>
                <th className="px-4 py-2 font-medium tabular-nums">% max</th>
                <th className="px-4 py-2 font-medium">Entregas</th>
                <th className="px-4 py-2 font-medium">Ultima entrega</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr
                  key={s.studentId}
                  className="border-t border-gray-100 hover:bg-gray-50/80"
                >
                  <td className="px-4 py-2.5 text-gray-900">
                    {s.studentName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-800">
                    {fmtNum(s.averageScore)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-600">
                    {fmtNum(s.averagePercent)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-700">
                    {s.gradedCount} / {s.evaluativeActivityCount}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">
                    {s.lastSubmittedAt
                      ? format(
                          new Date(s.lastSubmittedAt),
                          "dd/MM/yyyy HH:mm",
                          { locale: ptBR }
                        )
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pending ? (
          <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
            A carregar...
          </p>
        ) : null}
      </div>
    </div>
  )
}
