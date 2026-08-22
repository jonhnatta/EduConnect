"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ActivityExamEditor } from "@/components/dashboard/activity-exam-editor"
import { TrixActivityDescription } from "@/components/dashboard/trix-activity-description"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  ClassroomActivityRow,
  ClassroomActivityStatus,
  ClassroomActivityType,
} from "@/lib/activities/types"
import { ACTIVITY_TYPE_LABELS } from "@/lib/activities/types"
import {
  createActivity,
  updateActivity,
  uploadActivityAttachmentFiles,
} from "@/app/actions/classroom-activities"
import type { ActivityAttachment } from "@/lib/activities/attachments"
import {
  ACTIVITY_ATTACHMENT_ACCEPT,
  ACTIVITY_ATTACHMENT_MAX_BYTES,
  ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY,
  isAllowedActivityAttachmentType,
  parseActivityAttachments,
} from "@/lib/activities/attachments"
import { toast } from "sonner"
import { Paperclip, X } from "lucide-react"
import {
  parseExamFromSettings,
  totalExamPoints,
  validateExamDefinition,
  type ActivityExamDefinition,
} from "@/lib/activities/exam"
import {
  parseTrabalhoConfig,
  clampTrabalhoMaxFiles,
  TRABALHO_MAX_FILES_LIMIT,
  TRABALHO_DEFAULT_MAX_FILES,
  type TrabalhoMode,
} from "@/lib/activities/trabalho"

const TYPES: ClassroomActivityType[] = [
  "trabalho",
  "prova_objetiva",
  "lista_exercicios",
  "simulado",
]

/** Tipos em que o professor pode definir questoes (settings.exam). */
const EXAM_TYPES: ClassroomActivityType[] = [
  "prova_objetiva",
  "lista_exercicios",
]

const STATUSES: ClassroomActivityStatus[] = ["rascunho", "aberta", "encerrada"]

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${y}-${m}-${day}T${h}:${min}`
}

function datetimeLocalToIso(local: string): string | null {
  if (!local.trim()) return null
  const t = new Date(local).getTime()
  if (Number.isNaN(t)) return null
  return new Date(local).toISOString()
}

type Props = {
  classroomId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  activity: ClassroomActivityRow | null
  onSaved: () => void
}

export function ClassroomActivityFormDialog({
  classroomId,
  open,
  onOpenChange,
  activity,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<ClassroomActivityType>("trabalho")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startsLocal, setStartsLocal] = useState("")
  const [dueLocal, setDueLocal] = useState("")
  const [maxScore, setMaxScore] = useState("")
  const [status, setStatus] = useState<ClassroomActivityStatus>("aberta")
  const [keptAttachments, setKeptAttachments] = useState<ActivityAttachment[]>(
    []
  )
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [descriptionEditorKey, setDescriptionEditorKey] = useState(0)
  const [examDef, setExamDef] = useState<ActivityExamDefinition | null>(null)
  const [submissionMode, setSubmissionMode] = useState<TrabalhoMode>("texto")
  const [maxFiles, setMaxFiles] = useState(String(TRABALHO_DEFAULT_MAX_FILES))
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect -- Opening a draft editor must atomically copy the selected activity into local form state. */
    if (activity) {
      setType(activity.type)
      setTitle(activity.title)
      setDescription(activity.description ?? "")
      setStartsLocal(isoToDatetimeLocal(activity.starts_at))
      setDueLocal(isoToDatetimeLocal(activity.due_at))
      setMaxScore(
        activity.max_score != null ? String(activity.max_score) : ""
      )
      setStatus(activity.status)
      setKeptAttachments(parseActivityAttachments(activity.settings))
      setExamDef(parseExamFromSettings(activity.settings))
      const sub = parseTrabalhoConfig(activity.settings)
      setSubmissionMode(sub?.mode ?? "texto")
      setMaxFiles(String(sub?.maxFiles ?? TRABALHO_DEFAULT_MAX_FILES))
    } else {
      setType("trabalho")
      setTitle("")
      setDescription("")
      setStartsLocal("")
      setDueLocal("")
      setMaxScore("")
      setStatus("aberta")
      setKeptAttachments([])
      setExamDef(null)
      setSubmissionMode("texto")
      setMaxFiles(String(TRABALHO_DEFAULT_MAX_FILES))
    }
    setPendingFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
    setDescriptionEditorKey((k) => k + 1)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, activity])

  const addPendingFiles = (list: FileList | null) => {
    if (!list?.length) return
    const next: File[] = [...pendingFiles]
    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      if (file.size > ACTIVITY_ATTACHMENT_MAX_BYTES) {
        toast.error(
          `"${file.name}" excede o tamanho maximo (${Math.round(ACTIVITY_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB)`
        )
        continue
      }
      if (!isAllowedActivityAttachmentType(file.type, file.name)) {
        toast.error(`Tipo nao permitido: ${file.name}`)
        continue
      }
      if (
        keptAttachments.length + next.length >=
        ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY
      ) {
        toast.error(
          `No maximo ${ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY} arquivos por atividade`
        )
        break
      }
      next.push(file)
    }
    setPendingFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const examPayload =
      EXAM_TYPES.includes(type) &&
      examDef &&
      examDef.questions.length > 0
        ? examDef
        : null

    if (examPayload) {
      const exErr = validateExamDefinition(examPayload)
      if (exErr) {
        setLoading(false)
        toast.error(exErr)
        return
      }
      for (const q of examPayload.questions) {
        if (!q.prompt.trim()) {
          setLoading(false)
          toast.error("Preencha o enunciado de todas as questoes")
          return
        }
        if (q.type === "mcq") {
          const filled = q.options.filter((o) => o.trim().length > 0)
          if (filled.length < 2) {
            setLoading(false)
            toast.error("Cada questao de multipla escolha precisa de 2 opcoes preenchidas")
            return
          }
        }
      }
    }

    const max =
      maxScore.trim() === "" ? null : parseFloat(maxScore.replace(",", "."))
    let maxFinal =
      max != null && !Number.isNaN(max) && max >= 0 ? max : null
    if (examPayload) {
      maxFinal = totalExamPoints(examPayload)
    }

    // Entrega de trabalho: só para o tipo "trabalho"; demais tipos limpam (null)
    const submissionPayload =
      type === "trabalho"
        ? { mode: submissionMode, maxFiles: clampTrabalhoMaxFiles(maxFiles) }
        : null

    let newUploaded: ActivityAttachment[] = []
    if (pendingFiles.length > 0) {
      const fd = new FormData()
      pendingFiles.forEach((f) => fd.append("files", f))
      const up = await uploadActivityAttachmentFiles(classroomId, fd)
      if (!up.ok) {
        setLoading(false)
        toast.error(up.error)
        return
      }
      newUploaded = up.attachments
    }

    const attachments: ActivityAttachment[] = [
      ...keptAttachments,
      ...newUploaded,
    ]
    if (attachments.length > ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY) {
      setLoading(false)
      toast.error(
        `No maximo ${ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY} arquivos por atividade`
      )
      return
    }

    if (activity) {
      const res = await updateActivity({
        id: activity.id,
        classroomId,
        type,
        title,
        description,
        startsAt: datetimeLocalToIso(startsLocal),
        dueAt: datetimeLocalToIso(dueLocal),
        maxScore: maxFinal,
        status,
        attachments,
        exam: examPayload,
        submission: submissionPayload,
      })
      setLoading(false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Atividade atualizada")
    } else {
      const res = await createActivity({
        classroomId,
        type,
        title,
        description,
        startsAt: datetimeLocalToIso(startsLocal),
        dueAt: datetimeLocalToIso(dueLocal),
        maxScore: maxFinal,
        status,
        attachments,
        exam: examPayload,
        submission: submissionPayload,
      })
      setLoading(false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Atividade criada")
    }
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display">
              {activity ? "Editar atividade" : "Nova atividade"}
            </DialogTitle>
            <DialogDescription>
              Visivel apenas para alunos desta sala. Rascunho nao aparece para
              alunos ate publicar como aberta ou encerrada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  const nt = v as ClassroomActivityType
                  setType(nt)
                  if (!EXAM_TYPES.includes(nt)) setExamDef(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACTIVITY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="act-title">Titulo</Label>
              <Input
                id="act-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Descricao</Label>
              <p className="text-xs text-muted-foreground">
                Texto formatado e imagens embutidas (guardado como HTML seguro).
              </p>
              {open ? (
                <TrixActivityDescription
                  key={descriptionEditorKey}
                  classroomId={classroomId}
                  initialHtml={description}
                  onHtmlChange={setDescription}
                />
              ) : null}
            </div>
            {EXAM_TYPES.includes(type) ? (
              <ActivityExamEditor value={examDef} onChange={setExamDef} />
            ) : null}
            {type === "trabalho" ? (
              <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                <div className="grid gap-2">
                  <Label>Como o aluno deve entregar</Label>
                  <p className="text-xs text-muted-foreground">
                    Define o que o aluno preenche para enviar o trabalho.
                  </p>
                  <Select
                    value={submissionMode}
                    onValueChange={(v) => setSubmissionMode(v as TrabalhoMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="texto">Texto na plataforma</SelectItem>
                      <SelectItem value="arquivo">Arquivo anexado</SelectItem>
                      <SelectItem value="ambos">Texto e arquivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(submissionMode === "arquivo" || submissionMode === "ambos") && (
                  <div className="grid gap-2">
                    <Label htmlFor="act-maxfiles">
                      Máximo de arquivos (1 a {TRABALHO_MAX_FILES_LIMIT})
                    </Label>
                    <Input
                      id="act-maxfiles"
                      type="number"
                      min={1}
                      max={TRABALHO_MAX_FILES_LIMIT}
                      step={1}
                      value={maxFiles}
                      onChange={(e) => setMaxFiles(e.target.value)}
                    />
                  </div>
                )}
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="act-files">Anexos (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                PDF, Word (.doc / .docx) ou imagem. Ate{" "}
                {ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY} arquivos,{" "}
                {Math.round(ACTIVITY_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB cada.
              </p>
              <Input
                id="act-files"
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACTIVITY_ATTACHMENT_ACCEPT}
                className="cursor-pointer"
                onChange={(e) => addPendingFiles(e.target.files)}
              />
              {keptAttachments.length > 0 && (
                <ul className="text-sm space-y-1 border border-gray-100 rounded-md p-2">
                  {keptAttachments.map((a) => (
                    <li
                      key={a.url}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-gray-700 flex items-center gap-1 min-w-0">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        {a.filename}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-7 w-7"
                        onClick={() =>
                          setKeptAttachments((prev) =>
                            prev.filter((x) => x.url !== a.url)
                          )
                        }
                        aria-label="Remover anexo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {pendingFiles.length > 0 && (
                <ul className="text-sm space-y-1 border border-dashed border-gray-200 rounded-md p-2">
                  {pendingFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-gray-600">
                        {f.name} ({Math.round(f.size / 1024)} KB)
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-7 w-7"
                        onClick={() =>
                          setPendingFiles((prev) =>
                            prev.filter((_, j) => j !== i)
                          )
                        }
                        aria-label="Remover da fila"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="act-start">Inicio (opcional)</Label>
                <Input
                  id="act-start"
                  type="datetime-local"
                  value={startsLocal}
                  onChange={(e) => setStartsLocal(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="act-due">Prazo (opcional)</Label>
                <Input
                  id="act-due"
                  type="datetime-local"
                  value={dueLocal}
                  onChange={(e) => setDueLocal(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="act-score">Nota maxima (opcional)</Label>
              {examDef && examDef.questions.length > 0 ? (
                <p className="text-sm text-gray-600">
                  Soma dos pontos das questoes:{" "}
                  <span className="font-semibold text-gray-900">
                    {totalExamPoints(examDef)}
                  </span>
                </p>
              ) : (
                <Input
                  id="act-score"
                  type="number"
                  min={0}
                  step={0.5}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as ClassroomActivityStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "rascunho"
                        ? "Rascunho (só professor)"
                        : s === "aberta"
                          ? "Aberta"
                          : "Encerrada"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-[#1D4ED8] hover:bg-[#1E3A8A]"
              disabled={loading}
            >
              {loading ? "Salvando..." : activity ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
