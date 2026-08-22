import { 
  FileText, 
  Users, 
  BarChart3, 
  Sparkles, 
  BookOpen, 
  MessageCircle, 
  Target,
  CheckCircle2,
  Layout,
  Calendar,
  Shield
} from "lucide-react"

const professorFeatures = [
  {
    icon: FileText,
    title: "Publique conteúdo rico",
    description: "Crie artigos, exercícios, provas e simulados com um editor poderoso e intuitivo."
  },
  {
    icon: Users,
    title: "Gerencie suas turmas",
    description: "Crie salas de aula virtuais, acompanhe entregas e organize seus alunos."
  },
  {
    icon: Shield,
    title: "Publicação com controle",
    description: "Organize seus conteúdos e publique quando estiverem prontos."
  },
  {
    icon: BarChart3,
    title: "Análise de desempenho",
    description: "Acompanhe métricas de engajamento, visualizações e desempenho dos alunos."
  }
]

const alunoFeatures = [
  {
    icon: Layout,
    title: "Feed personalizado",
    description: "Conteúdo organizado por interesses, turmas e professores que você acompanha."
  },
  {
    icon: Calendar,
    title: "Plano de estudos",
    description: "Organize seus estudos com base no tempo disponível e nas suas metas."
  },
  {
    icon: MessageCircle,
    title: "Aprenda com sua comunidade",
    description: "Encontre conteúdos, exercícios e professores para apoiar seus estudos."
  },
  {
    icon: Target,
    title: "Acompanhe seu progresso",
    description: "Veja seu desempenho, conquistas e mantenha uma sequência de estudos."
  }
]

export function FeaturesSection() {
  return (
    <section className="py-20 lg:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
            Tudo que você precisa para ensinar e aprender
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Ferramentas poderosas para professores e uma experiência personalizada para alunos.
          </p>
        </div>

        {/* Professor Features */}
        <div className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-[#1D4ED8] flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-display text-2xl font-bold text-gray-900">Para Professores</h3>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {professorFeatures.map((feature) => (
              <div 
                key={feature.title} 
                className="group rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-[#1D4ED8] hover:shadow-lg"
              >
                <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-[#1D4ED8] transition-colors">
                  <feature.icon className="h-6 w-6 text-[#1D4ED8] group-hover:text-white transition-colors" />
                </div>
                <h4 className="font-display font-semibold text-gray-900 mb-2">{feature.title}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Aluno Features */}
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-[#10B981] flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-display text-2xl font-bold text-gray-900">Para Alunos</h3>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {alunoFeatures.map((feature) => (
              <div 
                key={feature.title} 
                className="group rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-[#10B981] hover:shadow-lg"
              >
                <div className="h-12 w-12 rounded-lg bg-green-50 flex items-center justify-center mb-4 group-hover:bg-[#10B981] transition-colors">
                  <feature.icon className="h-6 w-6 text-[#10B981] group-hover:text-white transition-colors" />
                </div>
                <h4 className="font-display font-semibold text-gray-900 mb-2">{feature.title}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Product highlight */}
        <div className="mt-20 rounded-2xl bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8] p-8 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-2 items-center">
            <div className="text-white">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium mb-4">
                <Shield className="h-4 w-4" />
                <span>Aprendizado conectado</span>
              </div>
              <h3 className="font-display text-2xl lg:text-3xl font-bold mb-4">
                Ferramentas para ensinar e aprender
              </h3>
              <p className="text-blue-100 leading-relaxed">
                Organize conteúdos, turmas e estudos em um ambiente pensado para
                professores e alunos.
              </p>
            </div>
            <div className="space-y-4">
              {[
                "Conteúdos e turmas em um só lugar",
                "Planos de estudo organizados por objetivos",
                "Feed baseado em interesses e acompanhamento",
                "Progresso e atividades para apoiar a rotina"
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-white">
                  <CheckCircle2 className="h-5 w-5 text-[#10B981] flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
