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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ActivityAttachment } from "@/lib/activities/attachments"
import {
  ACTIVITY_ATTACHMENT_ACCEPT,
  ACTIVITY_ATTACHMENT_MAX_BYTES,
  ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY,
  isAllowedActivityAttachmentType,
  parseActivityAttachments,
} from "@/lib/activities/attachments"
import type {
  ClassroomMaterialRow,
  ClassroomMaterialStatus,
} from "@/lib/materials/types"
import { MATERIAL_STATUS_LABELS } from "@/lib/materials/types"
import {
  createMaterial,
  updateMaterial,
  uploadMaterialAttachmentFiles,
} from "@/app/actions/classroom-materials"
import { toast } from "sonner"
import { Paperclip, X } from "lucide-react"

const STATUSES: ClassroomMaterialStatus[] = ["rascunho", "publicado"]

type Props = {
  classroomId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  material: ClassroomMaterialRow | null
  onSaved: () => void
}

export function ClassroomMaterialFormDialog({
  classroomId,
  open,
  onOpenChange,
  material,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [externalUrl, setExternalUrl] = useState("")
  const [status, setStatus] = useState<ClassroomMaterialStatus>("publicado")
  const [keptAttachments, setKeptAttachments] = useState<ActivityAttachment[]>(
    []
  )
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect -- Opening a draft editor must atomically copy the selected material into local form state. */
    if (material) {
      setTitle(material.title)
      setDescription(material.description ?? "")
      setExternalUrl(material.external_url ?? "")
      setStatus(material.status)
      setKeptAttachments(parseActivityAttachments(material.settings))
    } else {
      setTitle("")
      setDescription("")
      setExternalUrl("")
      setStatus("publicado")
      setKeptAttachments([])
    }
    setPendingFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, material])

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
          `No maximo ${ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY} arquivos por material`
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

    let newUploaded: ActivityAttachment[] = []
    if (pendingFiles.length > 0) {
      const fd = new FormData()
      pendingFiles.forEach((f) => fd.append("files", f))
      const up = await uploadMaterialAttachmentFiles(classroomId, fd)
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
        `No maximo ${ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY} arquivos por material`
      )
      return
    }

    if (material) {
      const res = await updateMaterial({
        id: material.id,
        classroomId,
        title,
        description,
        externalUrl: externalUrl.trim() || null,
        status,
        attachments,
      })
      setLoading(false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Material atualizado")
    } else {
      const res = await createMaterial({
        classroomId,
        title,
        description,
        externalUrl: externalUrl.trim() || null,
        status,
        attachments,
      })
      setLoading(false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Material adicionado")
    }
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display">
              {material ? "Editar material" : "Novo material extra"}
            </DialogTitle>
            <DialogDescription>
              Material de apoio para a turma — nao vale nota e nao substitui
              atividades avaliativas. Rascunho so aparece para voce ate
              publicar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="mat-title">Titulo</Label>
              <Input
                id="mat-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mat-desc">Descricao</Label>
              <Textarea
                id="mat-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mat-link">Link externo (opcional)</Label>
              <Input
                id="mat-link"
                type="url"
                inputMode="url"
                placeholder="https://..."
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Apenas HTTPS. Ex.: video, artigo, pagina de referencia.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mat-files">Anexos (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                PDF, Word ou imagem. Ate {ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY}{" "}
                arquivos, {Math.round(ACTIVITY_ATTACHMENT_MAX_BYTES / 1024 / 1024)}{" "}
                MB cada.
              </p>
              <Input
                id="mat-files"
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
            <div className="grid gap-2">
              <Label>Visibilidade</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as ClassroomMaterialStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "rascunho"
                        ? `${MATERIAL_STATUS_LABELS.rascunho} (so professor)`
                        : MATERIAL_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-[#1D4ED8] hover:bg-[#1E3A8A]"
              disabled={loading}
            >
              {loading ? "Salvando..." : material ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
