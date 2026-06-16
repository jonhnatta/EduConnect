"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BookOpen, GraduationCap, AlertCircle, ArrowRight, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

type UserType = "aluno" | "professor"

type Option = {
  value: UserType
  title: string
  description: string
  icon: typeof BookOpen
}

const options: Option[] = [
  {
    value: "aluno",
    title: "Sou aluno",
    description: "Quero estudar, acompanhar meu progresso e participar de salas.",
    icon: BookOpen,
  },
  {
    value: "professor",
    title: "Sou professor",
    description: "Quero criar conteudos, gerenciar salas e acompanhar alunos.",
    icon: GraduationCap,
  },
]

const acceptDoc = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
const maxDocBytes = 5 * 1024 * 1024

export function TipoContaForm({
  initialUserType = null,
}: {
  initialUserType?: UserType | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<UserType | null>(initialUserType)
  const [professorDoc, setProfessorDoc] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  function handlePickProfessorDoc(file: File | null) {
    setError(null)

    if (!file) {
      setProfessorDoc(null)
      return
    }

    if (file.size > maxDocBytes) {
      setProfessorDoc(null)
      setError("O documento deve ter no maximo 5MB")
      return
    }

    const allowed = ["application/pdf", "image/jpeg", "image/png"]
    if (file.type && !allowed.includes(file.type)) {
      setProfessorDoc(null)
      setError("Envie um arquivo PDF, JPG ou PNG")
      return
    }

    setProfessorDoc(file)
  }

  async function handleSubmit() {
    if (!selected) {
      setError("Escolha um tipo de conta para continuar")
      return
    }

    if (selected === "professor" && !professorDoc) {
      setError("Envie um documento para verificacao")
      return
    }

    if (!acceptedTerms) {
      setError("Voce precisa aceitar os Termos de Uso e a Politica de Privacidade")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userType: selected, acceptedTerms }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data?.ok) {
        setError(data?.error || "Nao foi possivel completar seu perfil")
        return
      }

      if (selected === "professor") {
        const formData = new FormData()
        formData.append("file", professorDoc as File)

        const uploadResponse = await fetch("/api/professor-verification/upload", {
          method: "POST",
          body: formData,
        })
        const uploadData = await uploadResponse.json().catch(() => ({}))

        if (!uploadResponse.ok || !uploadData?.ok) {
          setError(uploadData?.error || "Falha ao enviar documento")
          return
        }

        router.push("/dashboard/professor?status=pendente")
        router.refresh()
        return
      }

      router.push(data.redirectTo)
      router.refresh()
    } catch {
      setError("Nao foi possivel completar seu perfil agora")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        {options.map((option) => {
          const Icon = option.icon
          const active = selected === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelected(option.value)}
              className={`text-left rounded-lg border p-4 transition-colors ${
                active
                  ? "border-[#1D4ED8] bg-blue-50"
                  : "border-gray-200 bg-white hover:border-blue-200"
              }`}
            >
              <div className="flex gap-4">
                <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${
                  active ? "bg-[#1D4ED8] text-white" : "bg-gray-100 text-gray-600"
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{option.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{option.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selected === "professor" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Upload className="mt-0.5 h-5 w-5 text-amber-500 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900">Documento de verificacao</h3>
              <p className="mt-1 text-sm text-amber-800">
                Envie um documento que comprove sua atuacao como professor.
              </p>
              <ul className="mt-3 list-disc pl-5 text-sm text-amber-800 space-y-1">
                <li>Diploma ou certificado de formacao</li>
                <li>Comprovante profissional ou institucional</li>
                <li>Documento equivalente em PDF, JPG ou PNG</li>
              </ul>
            </div>
          </div>

          <label className="mt-4 block cursor-pointer rounded-lg border-2 border-dashed border-amber-300 bg-white p-5 text-center transition-colors hover:bg-amber-50/60">
            <input
              type="file"
              accept={acceptDoc}
              className="hidden"
              onChange={(event) => handlePickProfessorDoc(event.target.files?.[0] ?? null)}
            />
            <Upload className="mx-auto mb-2 h-7 w-7 text-amber-400" />
            <p className="text-sm text-amber-800">
              {professorDoc ? `Selecionado: ${professorDoc.name}` : "Clique para enviar o documento"}
            </p>
            <p className="mt-1 text-xs text-amber-700">PDF, JPG ou PNG (max 5MB)</p>
          </label>
        </div>
      )}

      <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
        />
        <span>
          Li e concordo com os{" "}
          <Link href="/termos" target="_blank" className="text-[#1D4ED8] underline font-medium">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" target="_blank" className="text-[#1D4ED8] underline font-medium">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>

      <Button
        type="button"
        className="w-full h-12 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-base font-semibold"
        disabled={isLoading || !acceptedTerms}
        onClick={handleSubmit}
      >
        {isLoading ? (selected === "professor" ? "Enviando..." : "Salvando...") : (
          <span className="flex items-center gap-2">
            {selected === "professor" ? "Enviar para analise" : "Continuar"}
            <ArrowRight className="h-5 w-5" />
          </span>
        )}
      </Button>
    </div>
  )
}
