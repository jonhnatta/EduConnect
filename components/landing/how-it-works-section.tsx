import { UserPlus, Settings, Sparkles, TrendingUp } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Cadastre-se",
    description: "Crie sua conta como professor ou aluno em menos de 2 minutos."
  },
  {
    number: "02",
    icon: Settings,
    title: "Configure seu perfil",
    description: "Escolha suas disciplinas, objetivos e preferências de aprendizado."
  },
  {
    number: "03",
    icon: Sparkles,
    title: "Aprenda e compartilhe",
    description: "Publique ou consuma conteúdo com sua turma e comunidade."
  },
  {
    number: "04",
    icon: TrendingUp,
    title: "Acompanhe o progresso",
    description: "Veja sua evolução com métricas detalhadas e relatórios personalizados."
  }
]

export function HowItWorksSection() {
  return (
    <section className="py-20 lg:py-32 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
            Como funciona
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Comece a usar o EduConnect em 4 passos simples
          </p>
        </div>

        {/* Steps */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[calc(50%+3rem)] w-[calc(100%-3rem)] h-0.5 bg-gray-200" />
              )}
              
              <div className="relative flex flex-col items-center text-center">
                {/* Number Badge */}
                <div className="absolute -top-2 -left-2 h-8 w-8 rounded-full bg-[#1D4ED8] text-white text-sm font-bold flex items-center justify-center z-10">
                  {step.number}
                </div>
                
                {/* Icon */}
                <div className="h-24 w-24 rounded-2xl bg-white shadow-lg flex items-center justify-center mb-6">
                  <step.icon className="h-10 w-10 text-[#1D4ED8]" />
                </div>
                
                {/* Content */}
                <h3 className="font-display text-xl font-bold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-600">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
