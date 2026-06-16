"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  GraduationCap, 
  BookOpen, 
  Eye, 
  EyeOff, 
  Mail, 
  Lock, 
  User,
  Calendar,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle
} from "lucide-react"

const niveisEnsino = [
  "Fundamental I",
  "Fundamental II", 
  "Ensino Medio",
  "Graduacao",
  "Pos-graduacao",
  "Outro"
]

const materias = [
  "Matematica",
  "Portugues",
  "Historia",
  "Geografia",
  "Ciencias",
  "Ingles",
  "Fisica",
  "Quimica",
  "Biologia",
  "Filosofia",
  "Sociologia",
  "Artes",
  "Educacao Fisica"
]

function CadastroContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipoParam = searchParams.get("tipo")
  const codigoConvite = searchParams.get("codigo")
  
  const [step, setStep] = useState<"escolha" | "formulario" | "confirmacao">("escolha")
  const [userType, setUserType] = useState<"aluno" | "professor" | null>(
    tipoParam === "professor" ? "professor" : tipoParam === "aluno" ? "aluno" : null
  )
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMaterias, setSelectedMaterias] = useState<string[]>([])
  const [selectedNiveis, setSelectedNiveis] = useState<string[]>([])
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const professorDocInputRef = useRef<HTMLInputElement | null>(null)
  const [professorDoc, setProfessorDoc] = useState<File | null>(null)
  
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    password: "",
    confirmPassword: "",
    dataNascimento: "",
    nivelEnsino: "",
    bio: "",
  })

  useEffect(() => {
    if (tipoParam === "professor" || tipoParam === "aluno") {
      setUserType(tipoParam)
      setStep("formulario")
    }
  }, [tipoParam])

  const handleUserTypeSelect = (type: "aluno" | "professor") => {
    setUserType(type)
    setStep("formulario")
  }

  const toggleMateria = (materia: string) => {
    setSelectedMaterias(prev => 
      prev.includes(materia) 
        ? prev.filter(m => m !== materia)
        : [...prev, materia]
    )
  }

  const toggleNivel = (nivel: string) => {
    setSelectedNiveis(prev => 
      prev.includes(nivel) 
        ? prev.filter(n => n !== nivel)
        : [...prev, nivel]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    
    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError("As senhas nao coincidem")
      setIsLoading(false)
      return
    }

    // Validate password strength
    if (formData.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres")
      setIsLoading(false)
      return
    }
    
    if (!userType) {
      setError("Selecione se voce e aluno ou professor")
      setIsLoading(false)
      return
    }

    if (userType === "professor" && !professorDoc) {
      setError("Envie um documento para verificacao")
      setIsLoading(false)
      return
    }

    if (!acceptedTerms) {
      setError("Voce precisa aceitar os Termos de Uso e a Politica de Privacidade")
      setIsLoading(false)
      return
    }

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: formData.email,
        password: formData.password,
        fullName: formData.nome,
        userType,
        interests: selectedMaterias,
        acceptedTerms,
      }),
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok || !payload?.ok) {
      setError(payload?.error || "Nao foi possivel criar a conta")
      setIsLoading(false)
      return
    }

    // Auto-login after signup
    await signIn("credentials", {
      redirect: false,
      email: formData.email,
      password: formData.password,
    })

    if (userType === "professor" && professorDoc) {
      try {
        const fd = new FormData()
        fd.set("file", professorDoc)
        const up = await fetch("/api/professor-verification/upload", {
          method: "POST",
          body: fd,
        })
        const upPayload = await up.json().catch(() => ({}))
        if (!up.ok || !upPayload?.ok) {
          setError(upPayload?.error || "Falha ao enviar documento")
          setIsLoading(false)
          return
        }
      } catch {
        setError("Falha ao enviar documento")
        setIsLoading(false)
        return
      }
    }

    setStep("confirmacao")
    setIsLoading(false)
  }

  const handleContinue = () => {
    if (userType === "professor") {
      router.push("/dashboard/professor?status=pendente")
      return
    }
    router.push("/dashboard/aluno")
  }

  const acceptDoc = "application/pdf,image/jpeg,image/png"

  const onPickProfessorDoc = (file: File | null) => {
    if (!file) {
      setProfessorDoc(null)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Arquivo muito grande (max 5MB)")
      setProfessorDoc(null)
      return
    }
    if (file.type && !acceptDoc.split(",").includes(file.type)) {
      setError("Tipo de arquivo nao permitido")
      setProfessorDoc(null)
      return
    }
    setProfessorDoc(file)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold text-gray-900">EduConnect</span>
          </Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-[#1D4ED8]">
            Ja tem conta? <span className="font-semibold">Entrar</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Step: Escolha */}
        {step === "escolha" && (
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
              Como voce vai usar o EduConnect?
            </h1>
            <p className="text-gray-600 mb-12">
              Escolha seu perfil para comecar
            </p>

            <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {/* Card Aluno */}
              <button
                onClick={() => handleUserTypeSelect("aluno")}
                className="group p-8 rounded-2xl border-2 border-gray-200 bg-white text-left transition-all hover:border-[#10B981] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:ring-offset-2"
              >
                <div className="h-16 w-16 rounded-xl bg-green-50 flex items-center justify-center mb-6 group-hover:bg-[#10B981] transition-colors">
                  <GraduationCap className="h-8 w-8 text-[#10B981] group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-display text-xl font-bold text-gray-900 mb-2">Sou Aluno</h3>
                <p className="text-gray-600 text-sm">
                  Quero aprender com os melhores professores e ter um plano de estudos personalizado
                </p>
              </button>

              {/* Card Professor */}
              <button
                onClick={() => handleUserTypeSelect("professor")}
                className="group p-8 rounded-2xl border-2 border-gray-200 bg-white text-left transition-all hover:border-[#1D4ED8] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:ring-offset-2"
              >
                <div className="h-16 w-16 rounded-xl bg-blue-50 flex items-center justify-center mb-6 group-hover:bg-[#1D4ED8] transition-colors">
                  <BookOpen className="h-8 w-8 text-[#1D4ED8] group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-display text-xl font-bold text-gray-900 mb-2">Sou Professor</h3>
                <p className="text-gray-600 text-sm">
                  Quero compartilhar conhecimento e gerenciar minhas turmas com apoio da IA
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step: Formulario */}
        {step === "formulario" && (
          <div>
            <button
              onClick={() => setStep("escolha")}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                  userType === "professor" ? "bg-[#1D4ED8]" : "bg-[#10B981]"
                }`}>
                  {userType === "professor" ? (
                    <BookOpen className="h-6 w-6 text-white" />
                  ) : (
                    <GraduationCap className="h-6 w-6 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-gray-900">
                    {userType === "professor" ? "Cadastro de Professor" : "Cadastro de Aluno"}
                  </h2>
                  <p className="text-gray-600 text-sm">Preencha seus dados para criar sua conta</p>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Nome */}
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="nome"
                      placeholder="Seu nome completo"
                      className="pl-10 h-12"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10 h-12"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Crie uma senha"
                        className="pl-10 pr-10 h-12"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirme sua senha"
                        className="pl-10 h-12"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Data de Nascimento */}
                <div className="space-y-2">
                  <Label htmlFor="dataNascimento">Data de nascimento</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="dataNascimento"
                      type="date"
                      className="pl-10 h-12"
                      value={formData.dataNascimento}
                      onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Campos específicos do Aluno */}
                {userType === "aluno" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="nivelEnsino">Nivel de ensino</Label>
                      <select
                        id="nivelEnsino"
                        className="w-full h-12 px-3 rounded-md border border-input bg-background"
                        value={formData.nivelEnsino}
                        onChange={(e) => setFormData({ ...formData, nivelEnsino: e.target.value })}
                        required
                      >
                        <option value="">Selecione seu nivel</option>
                        {niveisEnsino.map(nivel => (
                          <option key={nivel} value={nivel}>{nivel}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Materias de interesse</Label>
                      <div className="flex flex-wrap gap-2">
                        {materias.map(materia => (
                          <button
                            key={materia}
                            type="button"
                            onClick={() => toggleMateria(materia)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                              selectedMaterias.includes(materia)
                                ? "bg-[#10B981] text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {materia}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Campos específicos do Professor */}
                {userType === "professor" && (
                  <>
                    <div className="space-y-2">
                      <Label>Disciplinas que leciona</Label>
                      <div className="flex flex-wrap gap-2">
                        {materias.map(materia => (
                          <button
                            key={materia}
                            type="button"
                            onClick={() => toggleMateria(materia)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                              selectedMaterias.includes(materia)
                                ? "bg-[#1D4ED8] text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {materia}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Niveis de ensino em que atua</Label>
                      <div className="flex flex-wrap gap-2">
                        {niveisEnsino.map(nivel => (
                          <button
                            key={nivel}
                            type="button"
                            onClick={() => toggleNivel(nivel)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                              selectedNiveis.includes(nivel)
                                ? "bg-[#1D4ED8] text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {nivel}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bio">Mini bio (max 300 caracteres)</Label>
                      <Textarea
                        id="bio"
                        placeholder="Conte um pouco sobre sua experiencia como professor..."
                        className="min-h-[100px]"
                        maxLength={300}
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      />
                      <p className="text-xs text-gray-500 text-right">{formData.bio.length}/300</p>
                    </div>

                    {/* Verificação de Identidade */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                      <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        Verificacao de identidade profissional
                      </h4>
                      <p className="text-sm text-amber-700 mb-4">
                        Para garantir a qualidade da plataforma, precisamos verificar que voce e professor. 
                        Envie um dos documentos abaixo:
                      </p>
                      <ul className="text-sm text-amber-700 mb-4 space-y-1">
                        <li>- Diploma ou certificado de licenciatura</li>
                        <li>- Carteira funcional de escola</li>
                        <li>- Contracheque de instituicao de ensino</li>
                        <li>- Registro no Conselho de Educacao</li>
                      </ul>
                      <input
                        ref={professorDocInputRef}
                        type="file"
                        accept={acceptDoc}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          onPickProfessorDoc(f)
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => professorDocInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-amber-300 rounded-lg p-6 text-center bg-white hover:bg-amber-50/40 transition-colors"
                      >
                        <Upload className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                        <p className="text-sm text-amber-700">
                          {professorDoc
                            ? `Selecionado: ${professorDoc.name}`
                            : "Arraste um arquivo ou clique para enviar"}
                        </p>
                        <p className="text-xs text-amber-600 mt-1">PDF, JPG ou PNG (max 5MB)</p>
                      </button>
                      <p className="text-xs text-amber-600 mt-3">
                        Seus documentos sao analisados com seguranca e nao serao compartilhados.
                      </p>
                    </div>
                  </>
                )}

                {/* Aceite de Termos + Privacidade (LGPD) */}
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
                  type="submit"
                  className={`w-full h-12 text-base font-semibold ${
                    userType === "professor"
                      ? "bg-[#1D4ED8] hover:bg-[#1E3A8A]"
                      : "bg-[#10B981] hover:bg-[#059669]"
                  }`}
                  disabled={isLoading || !acceptedTerms}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Criando conta...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {userType === "professor" ? "Enviar cadastro para analise" : "Criar minha conta"}
                      <ArrowRight className="h-5 w-5" />
                    </span>
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* Step: Confirmacao */}
        {step === "confirmacao" && (
          <div className="text-center py-12">
            <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
              userType === "professor" ? "bg-amber-100" : "bg-green-100"
            }`}>
              <CheckCircle2 className={`h-10 w-10 ${
                userType === "professor" ? "text-amber-500" : "text-[#10B981]"
              }`} />
            </div>
            
            {userType === "professor" ? (
              <>
                <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
                  Cadastro enviado!
                </h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  Verifique seu e-mail para confirmar sua conta. Apos a confirmacao, 
                  nossa equipe ira analisar seus documentos. Voce recebera uma notificacao 
                  quando sua conta for aprovada.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
                  Conta criada com sucesso!
                </h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  Enviamos um e-mail de confirmacao para <strong>{formData.email}</strong>. 
                  Por favor, verifique sua caixa de entrada e clique no link para ativar sua conta.
                </p>
              </>
            )}

            <Button 
              onClick={handleContinue}
              className={`h-12 px-8 text-base font-semibold ${
                userType === "professor" 
                  ? "bg-[#1D4ED8] hover:bg-[#1E3A8A]" 
                  : "bg-[#10B981] hover:bg-[#059669]"
              }`}
            >
              <span className="flex items-center gap-2">
                Ir para Login
                <ArrowRight className="h-5 w-5" />
              </span>
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

export default function CadastroPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    }>
      <CadastroContent />
    </Suspense>
  )
}
