"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Globe, Lock, Plus } from "lucide-react"
import { createClassroom } from "@/app/actions/classrooms"
import { useRouter } from "next/navigation"

const NIVEIS = [
  "Fundamental I",
  "Fundamental II",
  "Ensino Medio",
  "Graduacao",
  "Pos-graduacao",
  "Outro",
]

type Props = {
  canCreate: boolean
  triggerClassName?: string
}

export function CreateClassroomDialog({ canCreate, triggerClassName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [educationLevel, setEducationLevel] = useState("")
  const [description, setDescription] = useState("")
  const [maxStudents, setMaxStudents] = useState("")
  const [isPublic, setIsPublic] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCreate) return
    setLoading(true)
    setError(null)
    let max: number | null = null
    if (maxStudents.trim() !== "") {
      const n = parseInt(maxStudents, 10)
      if (!Number.isNaN(n) && n >= 1) max = n
    }
    const result = await createClassroom({
      name,
      subject,
      educationLevel,
      description,
      maxStudents: max,
      isPublic,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    setName("")
    setSubject("")
    setEducationLevel("")
    setDescription("")
    setMaxStudents("")
    router.push(`/dashboard/professor/salas/${result.id}`)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className={triggerClassName ?? "bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"}
          disabled={!canCreate}
          title={
            !canCreate
              ? "Disponivel apos aprovacao do cadastro"
              : "Criar nova sala"
          }
        >
          <Plus className="h-4 w-4" />
          Criar Nova Sala
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display">Nova sala de aula</DialogTitle>
            <DialogDescription>
              Um codigo de convite unico sera gerado para voce compartilhar com os alunos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="sala-nome">Nome da sala</Label>
              <Input
                id="sala-nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex.: Matematica 3 Ano A"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sala-disciplina">Disciplina</Label>
              <Input
                id="sala-disciplina"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="Ex.: Matematica"
              />
            </div>
            <div className="grid gap-2">
              <Label>Nivel de ensino</Label>
              <Select
                required
                value={educationLevel}
                onValueChange={setEducationLevel}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {NIVEIS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sala-desc">Descricao (opcional)</Label>
              <Textarea
                id="sala-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Objetivos da turma, foco tematico..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sala-max">Limite de alunos (opcional)</Label>
              <Input
                id="sala-max"
                type="number"
                min={1}
                value={maxStudents}
                onChange={(e) => setMaxStudents(e.target.value)}
                placeholder="Ilimitado se vazio"
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo de sala</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${!isPublic ? "border-[#1D4ED8] bg-blue-50 text-[#1D4ED8] font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  <Lock className="h-4 w-4 shrink-0" />
                  Fechada (por convite)
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${isPublic ? "border-[#10B981] bg-emerald-50 text-[#10B981] font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  Aberta (publica)
                </button>
              </div>
              <p className="text-xs text-gray-400">
                {isPublic ? "Alunos poderao encontrar e entrar sem codigo de convite." : "Acesso somente via codigo de convite."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-[#1D4ED8] hover:bg-[#1E3A8A]"
              disabled={loading || !canCreate}
            >
              {loading ? "Criando..." : "Criar sala"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
