"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  removeClassroomCover,
  updateClassroomMural,
  uploadClassroomCover,
} from "@/app/actions/classrooms"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ImageIcon, Loader2 } from "lucide-react"
import { toast } from "sonner"

const DESCRIPTION_MAX = 5000

type Props = {
  classroomId: string
  initialDescription: string | null
  initialCoverPathname: string | null
}

function coverSrc(pathname: string): string {
  return `/api/activity-attachment?pathname=${encodeURIComponent(pathname)}`
}

export function ClassroomMuralEditor({
  classroomId,
  initialDescription,
  initialCoverPathname,
}: Props) {
  const router = useRouter()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState(initialDescription ?? "")
  const [coverPathname, setCoverPathname] = useState(initialCoverPathname)
  const [savingText, setSavingText] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [removingCover, setRemovingCover] = useState(false)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- A server refresh replaces the saved mural values and must reset this local editor draft. */
    setCoverPathname(initialCoverPathname)
    setDescription(initialDescription ?? "")
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialCoverPathname, initialDescription])

  const handleSaveText = async () => {
    setSavingText(true)
    const res = await updateClassroomMural(classroomId, description)
    setSavingText(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Texto do mural guardado")
    router.refresh()
  }

  const handleCoverFile = async (file: File | null) => {
    if (!file || file.size === 0) return
    setUploadingCover(true)
    const fd = new FormData()
    fd.set("file", file)
    const res = await uploadClassroomCover(classroomId, fd)
    setUploadingCover(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Capa atualizada")
    router.refresh()
  }

  const handleRemoveCover = async () => {
    if (!confirm("Remover a imagem de capa desta sala?")) return
    setRemovingCover(true)
    const res = await removeClassroomCover(classroomId)
    setRemovingCover(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setCoverPathname(null)
    toast.success("Capa removida")
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-2xl">
      <div>
        <h2 className="font-display text-lg font-semibold text-gray-900 mb-1">
          Imagem de capa
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Aparece no topo da visao geral dos alunos. JPEG, PNG, GIF ou WebP (max
          5 MB).
        </p>
        <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50 aspect-video max-h-56 flex items-center justify-center">
          {coverPathname ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxy URL autenticado
            <img
              src={coverSrc(coverPathname)}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon className="h-8 w-8" />
              <span className="text-sm">Nenhuma capa</span>
            </div>
          )}
        </div>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          disabled={uploadingCover}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            void handleCoverFile(f ?? null)
          }}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingCover}
            onClick={() => coverInputRef.current?.click()}
            className="gap-2"
          >
            {uploadingCover ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {uploadingCover ? "A enviar..." : "Carregar imagem"}
          </Button>
          {coverPathname ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              disabled={removingCover}
              onClick={() => void handleRemoveCover()}
            >
              {removingCover ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Remover capa"
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-8">
        <Label htmlFor="mural-description" className="text-base font-display">
          Texto do mural
        </Label>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Visivel na visao geral dos alunos (sobre a turma ou a materia).
        </p>
        <Textarea
          id="mural-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Escreva uma mensagem de boas-vindas, objetivos da turma, etc."
          rows={8}
          maxLength={DESCRIPTION_MAX}
          className="resize-y min-h-[120px]"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400">
            {description.length}/{DESCRIPTION_MAX}
          </span>
          <Button
            type="button"
            className="bg-[#1D4ED8] hover:bg-[#1E3A8A]"
            disabled={savingText}
            onClick={() => void handleSaveText()}
          >
            {savingText ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Guardar texto"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
