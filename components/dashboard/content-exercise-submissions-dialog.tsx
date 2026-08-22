"use client"

import {
  getExamDefinitionForContentItem,
  gradeContentExerciseOpenAnswers,
  listContentExerciseSubmissionsForAuthor,
  type ContentExerciseSubmissionListItem,
} from "@/app/actions/content-exercise-submissions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ActivityExamDefinition } from "@/lib/activities/exam"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

type Props = {
  contentItemId: string | null
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GradeBlockContent({
  contentItemId,
  exam,
  submission,
  onSaved,
}: {
  contentItemId: string
  exam: ActivityExamDefinition
  submission: ContentExerciseSubmissionListItem
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
      const res = await gradeContentExerciseOpenAnswers(
        contentItemId,
        submission.id,
        payload
      )
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
    <div className="space-y-3 border-t border-gray-100 pt-3 mt-3">
      <p className="text-xs font-medium text-gray-700">Dissertativas</p>
      {opens.map((q) => {
        const ans = submission.answers[q.id]
        const text = ans?.type === "open" ? ans.text : "—"
        return (
          <div key={q.id} className="rounded-md bg-gray-50 p-3 space-y-2">
            <p className="text-xs text-gray-600">{q.prompt}</p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap border border-gray-100 rounded bg-white p-2">
              {text}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label className="text-xs">Nota (max {q.points})</Label>
                <Input
                  type="number"
                  min={0}
                  max={q.points}
                  step={0.5}
                  className="h-9 w-24"
                  value={scores[q.id] ?? ""}
                  onChange={(e) =>
                    setScores((s) => ({ ...s, [q.id]: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
        )
      })}
      <Button
        type="button"
        size="sm"
        className="bg-[#1D4ED8] hover:bg-[#1E3A8A]"
        disabled={pending}
        onClick={save}
      >
        Salvar notas dissertativas
      </Button>
    </div>
  )
}

export function ContentExerciseSubmissionsDialog({
  contentItemId,
  title,
  open,
  onOpenChange,
}: Props) {
  const [rows, setRows] = useState<ContentExerciseSubmissionListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [exam, setExam] = useState<ActivityExamDefinition | null>(null)

  const load = useCallback(() => {
    if (!contentItemId) return
    setLoading(true)
    void Promise.all([
      listContentExerciseSubmissionsForAuthor(contentItemId),
      getExamDefinitionForContentItem(contentItemId),
    ]).then(([subRes, ex]) => {
      setExam(ex)
      setLoading(false)
      if (subRes.error) {
        toast.error(subRes.error)
        return
      }
      setRows(subRes.rows)
    })
  }, [contentItemId])

  useEffect(() => {
    if (!open || !contentItemId) return
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [open, contentItemId, load])

  if (!contentItemId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Entregas — {title}</DialogTitle>
          <DialogDescription>
            Respostas enviadas e correcao das dissertativas. Objetivas ja entram na nota
            automaticamente.
          </DialogDescription>
        </DialogHeader>
        {loading || !exam ? (
          <p className="text-sm text-gray-500 py-6">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-6">Nenhuma entrega ainda.</p>
        ) : (
          <ul className="space-y-6">
            {rows.map((sub) => (
              <li
                key={sub.id}
                className="border border-gray-100 rounded-lg p-4 space-y-2"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium text-gray-900">
                    {sub.student_name ?? "Aluno"}
                  </p>
                  <div className="text-sm text-gray-600">
                    {sub.status === "enviado" ? (
                      <>
                        Objetiva: {sub.score_mcq}
                        {sub.score_total != null && (
                          <span className="ml-2 font-semibold text-gray-900">
                            Total: {sub.score_total}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-700">Rascunho</span>
                    )}
                  </div>
                </div>
                {sub.status === "enviado" ? (
                  <GradeBlockContent
                    contentItemId={contentItemId}
                    exam={exam}
                    submission={sub}
                    onSaved={load}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
