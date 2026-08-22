"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { addDays, format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  createPersonalPlannerTask,
  deletePersonalPlannerTask,
  togglePersonalPlannerTaskDone,
  updatePersonalPlannerTask,
} from "@/app/actions/student-planner"
import { buildSubjectProgress } from "@/lib/student-planner/progress"
import type {
  ClassroomPlannerItem,
  PlannerWeekPayload,
} from "@/lib/student-planner/types"
import { ACTIVITY_TYPE_LABELS } from "@/lib/activities/types"
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Flame,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react"

const SUBJECT_PALETTE = [
  "#1D4ED8",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#0EA5E9",
  "#84CC16",
]

function colorForSubject(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return SUBJECT_PALETTE[h % SUBJECT_PALETTE.length]
}

function longWeekdayPt(short: string): string {
  const m: Record<string, string> = {
    Seg: "Segunda",
    Ter: "Terca",
    Qua: "Quarta",
    Qui: "Quinta",
    Sex: "Sexta",
    Sab: "Sabado",
    Dom: "Domingo",
  }
  return m[short] ?? short
}

function labelForClassroomActivityDate(it: ClassroomPlannerItem): string {
  const raw = it.dueAt ?? it.startsAt
  if (!raw) return "Sem data"
  try {
    return format(parseISO(raw), "EEE d MMM", { locale: ptBR })
  } catch {
    return "Sem data"
  }
}

type Props = {
  payload: PlannerWeekPayload
}

export function PlanoEstudosClient({ payload }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const weekStartIso = payload.weekStartIso
  const weekEndIso = payload.weekEndIso

  const defaultSelected = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd")
    const inWeek = payload.days.some((d) => d.dateIso === today)
    if (inWeek) return today
    return payload.days[0]?.dateIso ?? today
  }, [payload.days])

  const [selectedDateOverride, setSelectedDateIso] = useState(defaultSelected)
  const selectedDateIso = payload.days.some((day) => day.dateIso === selectedDateOverride)
    ? selectedDateOverride
    : defaultSelected

  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [newDate, setNewDate] = useState(defaultSelected)
  const [formError, setFormError] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editDate, setEditDate] = useState("")

  const subjectProgress = buildSubjectProgress(payload.days)

  const navigateWeek = (deltaWeeks: number) => {
    if (!weekStartIso) return
    const base = parseISO(weekStartIso + "T12:00:00")
    const next = addDays(base, deltaWeeks * 7)
    const monday = format(next, "yyyy-MM-dd")
    router.push(`/dashboard/aluno/plano?semana=${encodeURIComponent(monday)}`)
  }

  const weekRangeLabel =
    weekStartIso && weekEndIso
      ? `${format(parseISO(weekStartIso + "T12:00:00"), "d MMM", { locale: ptBR })} – ${format(parseISO(weekEndIso + "T12:00:00"), "d MMM yyyy", { locale: ptBR })}`
      : ""

  const selectedCol = payload.days.find((d) => d.dateIso === selectedDateIso)
  const selectedLong = selectedCol
    ? longWeekdayPt(selectedCol.weekdayShort)
    : ""

  const totalItems =
    payload.stats.personalTotal + payload.stats.classroomActivitiesInWeek
  const doneItems =
    payload.stats.personalDone + payload.stats.classroomSubmitted
  const metaPercent =
    totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null

  const handleAdd = () => {
    setFormError(null)
    startTransition(async () => {
      const r = await createPersonalPlannerTask({
        title: newTitle,
        notes: newNotes || undefined,
        scheduledOn: newDate,
      })
      if (!r.ok) {
        setFormError(r.error)
        return
      }
      setAddOpen(false)
      setNewTitle("")
      setNewNotes("")
      setNewDate(selectedDateIso)
      router.refresh()
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm("Remover esta tarefa?")) return
    startTransition(async () => {
      await deletePersonalPlannerTask(id)
      router.refresh()
    })
  }

  const handleTogglePersonal = (id: string, done: boolean) => {
    startTransition(async () => {
      await togglePersonalPlannerTaskDone(id, done)
      router.refresh()
    })
  }

  const openEdit = (t: {
    id: string
    title: string
    notes: string | null
    scheduledOn: string
  }) => {
    setEditId(t.id)
    setEditTitle(t.title)
    setEditNotes(t.notes ?? "")
    setEditDate(t.scheduledOn)
  }

  const saveEdit = () => {
    if (!editId) return
    startTransition(async () => {
      const r = await updatePersonalPlannerTask(editId, {
        title: editTitle,
        notes: editNotes || null,
        scheduledOn: editDate,
      })
      if (!r.ok) {
        alert(r.error)
        return
      }
      setEditId(null)
      router.refresh()
    })
  }

  if (payload.error) {
    return (
      <div className="max-w-6xl mx-auto rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-medium">Nao foi possivel carregar o plano.</p>
        <p className="text-sm mt-1">{payload.error}</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Plano de Estudos
          </h1>
          <p className="text-gray-600">
            Atividades das suas salas e tarefas pessoais da semana
          </p>
        </div>
        <Button
          type="button"
          className="gap-2"
          onClick={() => {
            setNewDate(selectedDateIso)
            setFormError(null)
            setAddOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Nova tarefa pessoal
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Flame className="h-5 w-5 text-orange-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-bold font-display text-gray-900">
                {payload.stats.streakDays}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span>Dias de sequencia</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex text-gray-400 hover:text-gray-600 shrink-0"
                      aria-label="Como funciona a sequencia"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    Conta cada dia em que voce concluiu uma tarefa pessoal ou
                    enviou uma atividade de sala (fuso Brasilia).
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-[#10B981]" />
            </div>
            <div>
              <div className="text-2xl font-bold font-display text-gray-900">
                {payload.stats.personalDone}
                <span className="text-lg text-gray-400 font-normal">
                  /{payload.stats.personalTotal || "0"}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Tarefas pessoais concluidas
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-[#1D4ED8]" />
            </div>
            <div>
              <div className="text-2xl font-bold font-display text-gray-900">
                {payload.stats.classroomSubmitted}
                <span className="text-lg text-gray-400 font-normal">
                  /{payload.stats.classroomActivitiesInWeek || "0"}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Atividades enviadas (salas)
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Target className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <div className="text-2xl font-bold font-display text-gray-900">
                {metaPercent != null ? `${metaPercent}%` : "—"}
              </div>
              <div className="text-xs text-gray-500">Itens concluidos (semana)</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigateWeek(-1)}
                disabled={pending || !weekStartIso}
                aria-label="Semana anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-400" />
                <span className="font-medium text-gray-900 text-center text-sm sm:text-base">
                  Semana {weekRangeLabel}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigateWeek(1)}
                disabled={pending || !weekStartIso}
                aria-label="Proxima semana"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {payload.days.map((col) => {
                const isSelected = col.dateIso === selectedDateIso
                const classroom = col.classroomItems.length
                const personal = col.personalItems.length
                const total = classroom + personal
                const personalDone = col.personalItems.filter((p) => p.isDone)
                  .length
                const classroomDone = col.classroomItems.filter(
                  (c) => c.submissionStatus === "enviado"
                ).length
                const done = personalDone + classroomDone

                return (
                  <button
                    key={col.dateIso}
                    type="button"
                    onClick={() => setSelectedDateIso(col.dateIso)}
                    className={`p-3 rounded-xl text-center transition-all ${
                      isSelected
                        ? "bg-[#10B981] text-white"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <div className="text-xs font-medium mb-1">
                      {col.weekdayShort}
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        isSelected ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {col.dayOfMonth}
                    </div>
                    {total > 0 && (
                      <div
                        className={`text-xs mt-1 ${
                          isSelected ? "text-green-100" : "text-gray-500"
                        }`}
                      >
                        {done}/{total}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {payload.undatedClassroomItems.length > 0 && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
              <h3 className="font-display font-semibold text-amber-900 mb-2">
                Sem data no calendario
              </h3>
              <p className="text-sm text-amber-800 mb-3">
                Estas atividades nao tem prazo nem inicio definido; abra na
                sala para ver detalhes.
              </p>
              <ul className="space-y-2">
                {payload.undatedClassroomItems.map((it) => (
                  <li key={it.activityId}>
                    <Link
                      href={it.href}
                      className="text-sm font-medium text-amber-950 underline-offset-2 hover:underline inline-flex items-center gap-1"
                    >
                      {it.activityTitle}
                      <span className="text-amber-700">
                        ({it.subject || it.classroomName})
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <h3 className="font-display font-semibold text-gray-900 mb-4">
              Tarefas de {selectedLong}
            </h3>

            {!selectedCol ||
            (selectedCol.classroomItems.length === 0 &&
              selectedCol.personalItems.length === 0) ? (
              <div className="text-center py-12 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Nenhuma tarefa programada para este dia.</p>
                <p className="text-sm mt-2">
                  Adicione uma tarefa pessoal ou veja outras salas na semana.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedCol.classroomItems.map((it) => (
                  <div
                    key={it.activityId}
                    className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                      it.submissionStatus === "enviado"
                        ? "bg-green-50 border-green-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div
                      className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                        it.submissionStatus === "enviado"
                          ? "bg-[#10B981]"
                          : "bg-[#1D4ED8]"
                      }`}
                    >
                      {it.submissionStatus === "enviado" ? (
                        <CheckCircle2 className="h-6 w-6 text-white" />
                      ) : (
                        <ExternalLink className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {it.activityTitle}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {it.subject || it.classroomName}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Sala
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-500">
                        {ACTIVITY_TYPE_LABELS[it.activityType]}
                        {it.submissionStatus === "rascunho" && (
                          <span className="ml-2 text-amber-600">
                            Rascunho guardado
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      className="shrink-0 bg-[#10B981] hover:bg-[#059669]"
                    >
                      <Link href={it.href}>Abrir atividade</Link>
                    </Button>
                  </div>
                ))}

                {selectedCol.personalItems.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                      t.isDone
                        ? "bg-green-50 border-green-200"
                        : "bg-blue-50/60 border-blue-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleTogglePersonal(t.id, !t.isDone)}
                      disabled={pending}
                      className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border-2 ${
                        t.isDone
                          ? "bg-[#10B981] border-[#10B981]"
                          : "border-gray-300 bg-white hover:border-[#10B981]"
                      }`}
                      aria-label={t.isDone ? "Marcar pendente" : "Marcar feito"}
                    >
                      {t.isDone ? (
                        <CheckCircle2 className="h-6 w-6 text-white" />
                      ) : null}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`font-medium ${
                            t.isDone
                              ? "text-gray-500 line-through"
                              : "text-gray-900"
                          }`}
                        >
                          {t.title}
                        </span>
                        <Badge className="text-xs bg-violet-600 hover:bg-violet-600">
                          Pessoal
                        </Badge>
                      </div>
                      {t.notes ? (
                        <p className="text-sm text-gray-600">{t.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => openEdit(t)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(t.id)}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <h3 className="font-display font-semibold text-gray-900 mb-4">
              Progresso por disciplina
            </h3>
            {subjectProgress.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhuma atividade de sala com data nesta semana.
              </p>
            ) : (
              <div className="space-y-4">
                {subjectProgress.map((disc) => {
                  const pct =
                    disc.total > 0
                      ? Math.round((disc.done / disc.total) * 100)
                      : 0
                  const cor = colorForSubject(disc.subject)
                  return (
                    <div key={disc.subject}>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600 truncate pr-2">
                          {disc.subject}
                        </span>
                        <span className="font-medium shrink-0" style={{ color: cor }}>
                          {disc.done}/{disc.total} enviadas
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: cor,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <h3 className="font-display font-semibold text-gray-900 mb-1">
              Avaliacoes da semana
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Atividades com prova nas suas turmas — para nao perder prazos.
            </p>
            {payload.evaluativeWeekItems.length === 0 ? (
              <p className="text-sm text-gray-500 mb-6">
                Nenhuma avaliacao com prova nesta semana (ou ainda sem data no
                calendario).
              </p>
            ) : (
              <ul className="space-y-3 mb-6">
                {payload.evaluativeWeekItems.map((it) => (
                  <li
                    key={it.activityId}
                    className="text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                  >
                    <Link
                      href={it.href}
                      className="font-medium text-gray-900 hover:text-[#1D4ED8] inline-flex items-start gap-1 group"
                    >
                      <span className="min-w-0 break-words">
                        {it.activityTitle}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-400 group-hover:text-[#1D4ED8]" />
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {it.subject || it.classroomName}
                      </Badge>
                      <Badge className="text-[10px] bg-[#1D4ED8] hover:bg-[#1D4ED8]">
                        Avaliacao
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {labelForClassroomActivityDate(it)}
                      {" · "}
                      {it.submissionStatus === "enviado"
                        ? "Entregue"
                        : it.submissionStatus === "rascunho"
                          ? "Rascunho"
                          : "Pendente"}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h4 className="font-display font-semibold text-gray-900 mb-1 text-sm">
              Tarefas pessoais na semana
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Suas anotacoes e lembretes — pode editar ou remover.
            </p>
            {payload.days.every((d) => d.personalItems.length === 0) ? (
              <p className="text-sm text-gray-500">
                Nenhuma tarefa pessoal. Use &quot;Nova tarefa pessoal&quot; para
                adicionar.
              </p>
            ) : (
              <ul className="space-y-3">
                {payload.days.flatMap((d) =>
                  d.personalItems.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-2 text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                    >
                      <button
                        type="button"
                        onClick={() => handleTogglePersonal(t.id, !t.isDone)}
                        disabled={pending}
                        className="mt-0.5"
                        aria-label="Alternar concluido"
                      >
                        {t.isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-[#10B981]" />
                        ) : (
                          <div className="h-5 w-5 rounded border-2 border-gray-300" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span
                          className={
                            t.isDone
                              ? "text-gray-500 line-through"
                              : "text-gray-800"
                          }
                        >
                          {t.title}
                        </span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {format(
                            parseISO(t.scheduledOn + "T12:00:00"),
                            "EEE d MMM",
                            { locale: ptBR }
                          )}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova tarefa pessoal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="ntitle">Titulo</Label>
              <Input
                id="ntitle"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex.: Revisar anotacoes"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ndate">Dia</Label>
              <Input
                id="ndate"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="nnotes">Notas (opcional)</Label>
              <Input
                id="nnotes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Detalhes..."
                className="mt-1"
              />
            </div>
            {formError ? (
              <p className="text-sm text-red-600">{formError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={pending || !newTitle.trim()}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editId != null} onOpenChange={() => setEditId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="etitle">Titulo</Label>
              <Input
                id="etitle"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edate">Dia</Label>
              <Input
                id="edate"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="enotes">Notas</Label>
              <Input
                id="enotes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditId(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveEdit} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
