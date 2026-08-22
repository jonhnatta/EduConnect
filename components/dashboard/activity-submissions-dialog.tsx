"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, Loader2 } from "lucide-react"
import { ActivityAttachmentsList } from "@/components/dashboard/activity-attachments-list"
import {
  gradeOpenAnswers,
  gradeTrabalho,
  listSubmissionsForActivity,
  type SubmissionListItem,
} from "@/app/actions/activity-submissions"
import type { ClassroomActivityRow } from "@/lib/activities/types"
import {
  parseExamFromSettings,
  ungradedOpenCount,
  type ActivityExamDefinition,
} from "@/lib/activities/exam"
import { parseTrabalhoConfig } from "@/lib/activities/trabalho"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

type Props = {
  classroomId: string
  activity: ClassroomActivityRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GradeBlock({
  classroomId,
  activityId,
  exam,
  submission,
  onSaved,
}: {
  classroomId: string
  activityId: string
  exam: ActivityExamDefinition
  submission: SubmissionListItem
  onSaved: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const opens = exam.questions.filter((q) => q.type === "open")

  const [scores, setScores] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const q of opens) {
      const v = submission.open_scores[q.id]
      o[q.id] = v !== undefined ? String(v) : ""
    }
    return o
  })

  if (opens.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        So questoes objetivas — nota da parte objetiva: {submission.score_mcq}
      </p>
    )
  }

  const save = () => {
    const payload: Record<string, number> = {}
    for (const q of opens) {
      const raw = scores[q.id]?.trim()
      if (raw === "" || raw === undefined) continue
      const v = parseFloat(raw.replace(",", "."))
      if (Number.isNaN(v) || v < 0 || v > q.points) {
        toast.error(`Nota invalida na questao (max ${q.points})`)
        return
      }
      payload[q.id] = v
    }
    startTransition(async () => {
      const res = await gradeOpenAnswers(classroomId, activityId, submission.id, payload)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Notas salvas")
      onSaved()
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 border-t border-gray-100 pt-4 mt-3">
      {opens.map((q, idx) => {
        const ans = submission.answers[q.id]
        const text = ans?.type === "open" ? ans.text : ""
        const graded =
          typeof submission.open_scores[q.id] === "number" &&
          !Number.isNaN(submission.open_scores[q.id])
        return (
          <div key={q.id} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-700">
                Questao aberta {idx + 1} de {opens.length}
              </span>
              {graded ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Corrigida
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                  <Clock className="h-3.5 w-3.5" /> Pendente
                </span>
              )}
            </div>
            <div className="p-3 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Enunciado</p>
                <p className="text-sm text-gray-700">{q.prompt}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Resposta do aluno</p>
                <div className="min-h-[72px] max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-900">
                  {text.trim() ? text : <span className="text-gray-400">— sem resposta —</span>}
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-gray-600">Nota</label>
                  <Input
                    type="number"
                    min={0}
                    max={q.points}
                    step={0.5}
                    className="h-10 w-28 text-base"
                    placeholder="0"
                    value={scores[q.id] ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [q.id]: e.target.value }))}
                  />
                </div>
                <span className="pb-2 text-sm text-gray-400">de {q.points} pts</span>
              </div>
            </div>
          </div>
        )
      })}
      <Button
        type="button"
        className="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
        disabled={pending}
        onClick={save}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Salvar correcao
      </Button>
    </div>
  )
}

function TrabalhoGradeBlock({
  classroomId,
  activityId,
  submission,
  maxScore,
  onSaved,
}: {
  classroomId: string
  activityId: string
  submission: SubmissionListItem
  maxScore: number | null
  onSaved: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const max = maxScore ?? 10
  const [score, setScore] = useState<string>(
    submission.score_total != null ? String(submission.score_total) : ""
  )

  const save = () => {
    const v = parseFloat((score ?? "").replace(",", "."))
    if (Number.isNaN(v) || v < 0 || v > max) {
      toast.error(`Nota invalida (0 a ${max})`)
      return
    }
    startTransition(async () => {
      const res = await gradeTrabalho(classroomId, activityId, submission.id, v)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Nota salva")
      onSaved()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3 mt-3">
      {submission.submission_text ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Texto enviado</p>
          <div className="min-h-[72px] max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900">
            {submission.submission_text}
          </div>
        </div>
      ) : null}
      {submission.submission_attachments.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Arquivos enviados</p>
          <ActivityAttachmentsList attachments={submission.submission_attachments} />
        </div>
      ) : null}
      {!submission.submission_text && submission.submission_attachments.length === 0 ? (
        <p className="text-sm text-gray-400">Entrega sem conteudo.</p>
      ) : null}
      <div className="flex items-end gap-2">
        <div className="grid gap-1">
          <label className="text-xs font-medium text-gray-600">Nota</label>
          <Input
            type="number"
            min={0}
            max={max}
            step={0.5}
            className="h-10 w-28 text-base"
            placeholder="0"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </div>
        <span className="pb-2 text-sm text-gray-400">de {max} pts</span>
        <Button
          type="button"
          className="ml-auto bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
          disabled={pending}
          onClick={save}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar nota
        </Button>
      </div>
    </div>
  )
}

export function ActivitySubmissionsDialog({
  classroomId,
  activity,
  open,
  onOpenChange,
}: Props) {
  const [rows, setRows] = useState<SubmissionListItem[]>([])
  const [loading, setLoading] = useState(false)

  const exam = activity ? parseExamFromSettings(activity.settings) : null
  const trabalhoCfg = activity ? parseTrabalhoConfig(activity.settings) : null
  const isTrabalho = !exam && !!trabalhoCfg

  const load = useCallback(() => {
    if (!activity) return
    setLoading(true)
    void listSubmissionsForActivity(classroomId, activity.id).then(
      ({ rows: r, error }) => {
        setLoading(false)
        if (error) {
          toast.error(error)
          return
        }
        setRows(r)
      }
    )
  }, [activity, classroomId])

  useEffect(() => {
    if (!open || !activity) return
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [open, activity, load])

  // Pendentes de correcao primeiro, depois corrigidos, depois rascunhos
  const sortedRows = useMemo(() => {
    const rank = (sub: SubmissionListItem) => {
      if (sub.status !== "enviado") return 2
      if (isTrabalho) return sub.score_total == null ? 0 : 1
      if (exam) return ungradedOpenCount(exam, sub.open_scores) > 0 ? 0 : 1
      return 1
    }
    return [...rows].sort((a, b) => rank(a) - rank(b))
  }, [rows, exam, isTrabalho])

  if (!activity || (!exam && !trabalhoCfg)) return null

  const pendingTotal = rows.filter((s) => {
    if (s.status !== "enviado") return false
    if (isTrabalho) return s.score_total == null
    return exam ? ungradedOpenCount(exam, s.open_scores) > 0 : false
  }).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Entregas — {activity.title}</DialogTitle>
          <DialogDescription>
            {pendingTotal > 0
              ? `${pendingTotal} entrega(s) aguardando correcao.`
              : "Nenhuma correcao pendente."}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-gray-500 py-6">Carregando...</p>
        ) : sortedRows.length === 0 ? (
          <p className="text-sm text-gray-500 py-6">Nenhuma entrega ainda.</p>
        ) : (
          <ul className="space-y-6">
            {sortedRows.map((sub) => {
              const isDraft = sub.status !== "enviado"
              const pendentes =
                isDraft || !exam ? 0 : ungradedOpenCount(exam, sub.open_scores)
              const trabalhoPending = isTrabalho && !isDraft && sub.score_total == null
              return (
                <li key={sub.id} className="border border-gray-100 rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">{sub.student_name ?? "Aluno"}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      {isDraft ? (
                        <Badge className="bg-amber-100 text-amber-800">Rascunho</Badge>
                      ) : isTrabalho ? (
                        trabalhoPending ? (
                          <Badge className="bg-red-100 text-red-700">Pendente</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700">
                            Corrigida{sub.score_total != null ? ` · ${sub.score_total}` : ""}
                          </Badge>
                        )
                      ) : pendentes > 0 ? (
                        <Badge className="bg-red-100 text-red-700">{pendentes} pendente(s)</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700">Corrigida</Badge>
                      )}
                      {!isDraft && !isTrabalho && (
                        <span>
                          Objetiva: {sub.score_mcq}
                          {sub.score_total != null && (
                            <span className="ml-2 font-semibold text-gray-900">Total: {sub.score_total}</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isDraft && isTrabalho ? (
                    <TrabalhoGradeBlock
                      classroomId={classroomId}
                      activityId={activity.id}
                      submission={sub}
                      maxScore={activity.max_score}
                      onSaved={load}
                    />
                  ) : !isDraft && exam ? (
                    <GradeBlock
                      classroomId={classroomId}
                      activityId={activity.id}
                      exam={exam}
                      submission={sub}
                      onSaved={load}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
