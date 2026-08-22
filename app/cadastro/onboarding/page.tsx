"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { saveOnboardingAnswers } from "@/app/actions/student-planner"
import { Button } from "@/components/ui/button"
import { GraduationCap, Target, Clock, Brain, BookOpen, ArrowRight, ArrowLeft, Sparkles } from "lucide-react"
import { Progress } from "@/components/ui/progress"

const objetivos = [
  { id: "enem", label: "Aprovacao no ENEM", icon: Target },
  { id: "concurso", label: "Concurso publico", icon: BookOpen },
  { id: "recuperacao", label: "Recuperacao escolar", icon: Brain },
  { id: "interesse", label: "Aprender por interesse", icon: Sparkles },
  { id: "reforco", label: "Reforco em disciplinas", icon: GraduationCap },
]

const tempoDisponivel = [
  { id: "30min", label: "Menos de 30 min", description: "Sessoes curtas e objetivas" },
  { id: "1h", label: "30 min a 1h", description: "Sessoes equilibradas" },
  { id: "2h", label: "1h a 2h", description: "Estudo aprofundado" },
  { id: "mais", label: "Mais de 2h", description: "Dedicacao intensiva" },
]

const materias = [
  "Matematica",
  "Portugues",
  "Historia",
  "Geografia",
  "Fisica",
  "Quimica",
  "Biologia",
  "Ingles",
  "Filosofia",
  "Sociologia",
]

const estilos = [
  { id: "videos", label: "Videos", description: "Aprendo melhor assistindo aulas", icon: "🎬" },
  { id: "textos", label: "Textos e artigos", description: "Prefiro ler e fazer anotacoes", icon: "📚" },
  { id: "exercicios", label: "Exercicios praticos", description: "Aprendo fazendo na pratica", icon: "✏️" },
  { id: "resumos", label: "Resumos e mapas", description: "Gosto de visualizar conceitos", icon: "🗺️" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const totalSteps = 4

  const [answers, setAnswers] = useState({
    objetivo: "",
    tempo: "",
    dificuldades: [] as string[],
    estilo: "",
  })

  const progress = (currentStep / totalSteps) * 100

  const handleNext = async () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    } else {
      setIsGenerating(true)
      setSaveError(null)
      const result = await saveOnboardingAnswers(answers)
      if (!result.ok) {
        setIsGenerating(false)
        setSaveError(result.error)
        return
      }
      router.push("/dashboard/aluno")
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const toggleDificuldade = (materia: string) => {
    setAnswers(prev => ({
      ...prev,
      dificuldades: prev.dificuldades.includes(materia)
        ? prev.dificuldades.filter(m => m !== materia)
        : [...prev.dificuldades, materia]
    }))
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1: return answers.objetivo !== ""
      case 2: return answers.tempo !== ""
      case 3: return answers.dificuldades.length > 0
      case 4: return answers.estilo !== ""
      default: return false
    }
  }

  if (isGenerating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1E3A8A] to-[#1D4ED8] flex items-center justify-center p-4">
        <div className="text-center text-white max-w-md">
          <div className="mb-8">
            <div className="h-24 w-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-6 relative">
              <Brain className="h-12 w-12 text-white animate-pulse" />
              <div className="absolute inset-0 rounded-full border-4 border-white/20 border-t-white animate-spin" />
            </div>
          </div>
          <h2 className="font-display text-2xl font-bold mb-4">
            Estamos montando seu plano de estudos personalizado...
          </h2>
          <p className="text-blue-100 mb-8">
            Estamos organizando suas respostas para preparar seu plano de estudos
          </p>
          <div className="space-y-3 text-sm text-blue-200">
            <div className="flex items-center gap-3 justify-center animate-pulse">
              <div className="h-2 w-2 rounded-full bg-[#10B981]" />
              Analisando seu objetivo de aprendizado...
            </div>
            <div className="flex items-center gap-3 justify-center animate-pulse delay-100">
              <div className="h-2 w-2 rounded-full bg-[#10B981]" />
              Calculando carga horaria ideal...
            </div>
            <div className="flex items-center gap-3 justify-center animate-pulse delay-200">
              <div className="h-2 w-2 rounded-full bg-[#10B981]" />
              Selecionando conteudos prioritarios...
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="font-display text-xl font-bold text-gray-900">EduConnect</span>
            </div>
            <span className="text-sm text-gray-500">Passo {currentStep} de {totalSteps}</span>
          </div>
          <Progress value={progress} className="h-2 bg-gray-200" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Step 1: Objetivo */}
        {currentStep === 1 && (
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
              Qual e o seu objetivo principal?
            </h1>
            <p className="text-gray-600 mb-8">
              Isso nos ajuda a priorizar os conteudos certos para voce
            </p>

            <div className="space-y-3">
              {objetivos.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setAnswers({ ...answers, objetivo: obj.id })}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    answers.objetivo === obj.id
                      ? "border-[#10B981] bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                    answers.objetivo === obj.id ? "bg-[#10B981]" : "bg-gray-100"
                  }`}>
                    <obj.icon className={`h-6 w-6 ${
                      answers.objetivo === obj.id ? "text-white" : "text-gray-600"
                    }`} />
                  </div>
                  <span className="font-medium text-gray-900">{obj.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Tempo */}
        {currentStep === 2 && (
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
              Quanto tempo voce tem disponivel para estudar por dia?
            </h1>
            <p className="text-gray-600 mb-8">
              Vamos adaptar seu plano a sua rotina
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {tempoDisponivel.map((tempo) => (
                <button
                  key={tempo.id}
                  onClick={() => setAnswers({ ...answers, tempo: tempo.id })}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    answers.tempo === tempo.id
                      ? "border-[#10B981] bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className={`h-5 w-5 ${
                      answers.tempo === tempo.id ? "text-[#10B981]" : "text-gray-400"
                    }`} />
                    <span className="font-semibold text-gray-900">{tempo.label}</span>
                  </div>
                  <p className="text-sm text-gray-600">{tempo.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Dificuldades */}
        {currentStep === 3 && (
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
              Em quais materias voce sente mais dificuldade?
            </h1>
            <p className="text-gray-600 mb-8">
              Selecione uma ou mais materias. Vamos focar nelas primeiro.
            </p>

            <div className="flex flex-wrap gap-3">
              {materias.map((materia) => (
                <button
                  key={materia}
                  onClick={() => toggleDificuldade(materia)}
                  className={`px-5 py-3 rounded-full font-medium transition-all ${
                    answers.dificuldades.includes(materia)
                      ? "bg-[#10B981] text-white"
                      : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {materia}
                </button>
              ))}
            </div>

            {answers.dificuldades.length > 0 && (
              <p className="mt-6 text-sm text-gray-600">
                {answers.dificuldades.length} materia(s) selecionada(s)
              </p>
            )}
          </div>
        )}

        {/* Step 4: Estilo */}
        {currentStep === 4 && (
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
              Qual e o seu estilo de aprendizado?
            </h1>
            <p className="text-gray-600 mb-8">
              Vamos priorizar o tipo de conteudo que funciona melhor para voce
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {estilos.map((estilo) => (
                <button
                  key={estilo.id}
                  onClick={() => setAnswers({ ...answers, estilo: estilo.id })}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    answers.estilo === estilo.id
                      ? "border-[#10B981] bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-3xl mb-3">{estilo.icon}</div>
                  <h3 className="font-semibold text-gray-900 mb-1">{estilo.label}</h3>
                  <p className="text-sm text-gray-600">{estilo.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        {saveError && (
          <p className="mt-6 text-sm text-red-600 text-center">{saveError}</p>
        )}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 1 || isGenerating}
            className="text-gray-600"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed() || isGenerating}
            className="bg-[#10B981] hover:bg-[#059669]"
          >
            {currentStep === totalSteps ? "Gerar meu plano" : "Continuar"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>
    </div>
  )
}
