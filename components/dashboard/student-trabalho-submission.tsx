"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Paperclip, X, Loader2, CheckCircle2 } from "lucide-react"
import { ActivityAttachmentsList } from "@/components/dashboard/activity-attachments-list"
import {
  uploadTrabalhoFiles,
  submitTrabalho,
  type ActivitySubmissionRow,
} from "@/app/actions/activity-submissions"
import {
  type TrabalhoSubmissionConfig,
  trabalhoModeRequiresText,
  trabalhoModeRequiresFile,
} from "@/lib/activities/trabalho"
import {
  ACTIVITY_ATTACHMENT_ACCEPT,
  ACTIVITY_ATTACHMENT_MAX_BYTES,
  isAllowedActivityAttachmentType,
} from "@/lib/activities/attachments"

type Props = {
  classroomId: string
  activityId: string
  config: TrabalhoSubmissionConfig
  initialSubmission: ActivitySubmissionRow | null
  activityClosed: boolean
  maxScore: number | null
}

export function StudentTrabalhoSubmission({
  classroomId,
  activityId,
  config,
  initialSubmission,
  activityClosed,
  maxScore,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [text, setText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const submitted = initialSubmission?.status === "enviado"
  const needsText = trabalhoModeRequiresText(config.mode)
  const needsFile = trabalhoModeRequiresFile(config.mode)

  // Já enviado: visão somente leitura
  if (submitted) {
    const graded =
      initialSubmission?.score_total !== null &&
      initialSubmission?.score_total !== undefined
    return (
      <div className="mt-8 border-t border-gray-100 pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-semibold text-gray-900">Sua entrega</h2>
          <Badge className="bg-emerald-100 text-emerald-700">Enviada</Badge>
        </div>
        {initialSubmission?.submission_text ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">
              Texto enviado
            </p>
            <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900">
              {initialSubmission.submission_text}
            </div>
          </div>
        ) : null}
        {initialSubmission && initialSubmission.submission_attachments.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">
              Arquivos enviados
            </p>
            <ActivityAttachmentsList
              attachments={initialSubmission.submission_attachments}
            />
          </div>
        ) : null}
        {graded ? (
          <div className="rounded-lg border border-[#1D4ED8]/25 bg-blue-50/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">
              Nota
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
              {initialSubmission?.score_total}
              {maxScore != null ? (
                <span className="text-base font-semibold text-gray-500"> / {maxScore}</span>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Aguardando correção do professor.</p>
        )}
      </div>
    )
  }

  if (activityClosed) {
    return (
      <div className="mt-8 border-t border-gray-100 pt-6">
        <p className="text-sm text-amber-700">
          Esta atividade está encerrada e não aceita mais entregas.
        </p>
      </div>
    )
  }

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const next = [...files]
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      if (f.size > ACTIVITY_ATTACHMENT_MAX_BYTES) {
        toast.error(`"${f.name}" excede ${Math.round(ACTIVITY_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB`)
        continue
      }
      if (!isAllowedActivityAttachmentType(f.type, f.name)) {
        toast.error(`Tipo não permitido: ${f.name}`)
        continue
      }
      if (next.length >= config.maxFiles) {
        toast.error(`No máximo ${config.maxFiles} arquivo(s)`)
        break
      }
      next.push(f)
    }
    setFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = () => {
    if (needsText && !text.trim()) {
      toast.error("Escreva sua resposta para enviar")
      return
    }
    if (needsFile && files.length === 0) {
      toast.error("Anexe ao menos um arquivo para enviar")
      return
    }
    start(async () => {
      let attachments: { url: string; pathname: string; filename: string; contentType: string; size: number; uploadedAt: string }[] = []
      if (needsFile && files.length > 0) {
        const fd = new FormData()
        files.forEach((f) => fd.append("files", f))
        const up = await uploadTrabalhoFiles(classroomId, activityId, fd)
        if (!up.ok) {
          toast.error(up.error)
          return
        }
        attachments = up.attachments
      }
      const res = await submitTrabalho(classroomId, activityId, {
        text: text.trim(),
        attachments,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Trabalho enviado!")
      router.refresh()
    })
  }

  return (
    <div className="mt-8 border-t border-gray-100 pt-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Enviar trabalho</h2>

      {needsText ? (
        <div className="grid gap-2">
          <Label htmlFor="trabalho-text">Sua resposta</Label>
          <textarea
            id="trabalho-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            maxLength={20000}
            placeholder="Digite sua resposta..."
            className="w-full rounded-md border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
          />
        </div>
      ) : null}

      {needsFile ? (
        <div className="grid gap-2">
          <Label htmlFor="trabalho-files">
            Anexar arquivo (até {config.maxFiles}; PDF, Word ou imagem)
          </Label>
          <Input
            id="trabalho-files"
            ref={fileInputRef}
            type="file"
            multiple={config.maxFiles > 1}
            accept={ACTIVITY_ATTACHMENT_ACCEPT}
            className="cursor-pointer"
            onChange={(e) => addFiles(e.target.files)}
          />
          {files.length > 0 && (
            <ul className="text-sm space-y-1 border border-dashed border-gray-200 rounded-md p-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate text-gray-700 flex items-center gap-1 min-w-0">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    {f.name} ({Math.round(f.size / 1024)} KB)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remover"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Button
        type="button"
        className="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
        disabled={pending}
        onClick={handleSubmit}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Enviar trabalho
      </Button>
      <p className="text-xs text-gray-400">
        Após enviar, não é possível editar. Revise antes de confirmar.
      </p>
    </div>
  )
}
