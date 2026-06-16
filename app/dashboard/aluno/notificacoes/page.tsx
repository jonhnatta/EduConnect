import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, BookOpen, Briefcase, CalendarClock, CheckCircle2, Sparkles } from "lucide-react"

const unreadNotifications = [
  {
    title: "Nova atividade publicada na sala de Biologia",
    description: "Seu professor adicionou uma atividade avaliativa com prazo para esta semana.",
    time: "Ha 12 min",
    tone: "emerald",
    icon: BookOpen,
  },
  {
    title: "Seu plano de estudos precisa de atencao",
    description: "Voce concluiu menos metas do que o previsto e pode reorganizar a agenda.",
    time: "Ha 1 h",
    tone: "amber",
    icon: CalendarClock,
  },
  {
    title: "Perfil publico pronto para receber visitas",
    description: "Atualize seus objetivos e interesses para mostrar melhor o que voce esta construindo.",
    time: "Hoje",
    tone: "blue",
    icon: Briefcase,
  },
]

const recentNotifications = [
  "Voce recebeu uma nova recomendacao do Tutor IA.",
  "Um professor respondeu um comentario em um conteudo salvo.",
  "Sua sequencia de estudos foi mantida ontem.",
]

export default function AlunoNotificacoesPage() {
  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-[#059669]">
            Central de notificacoes
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Notificacoes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Uma pagina simples para concentrar alertas que impactam seu estudo e exposicao publica.
          </p>
        </div>
        <Button variant="outline">Marcar tudo como lido</Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <Bell className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Nao lidas</p>
              <p className="font-display text-2xl font-bold text-gray-900">{unreadNotifications.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <Sparkles className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tutor IA</p>
              <p className="font-display text-2xl font-bold text-gray-900">2 alertas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Concluidas hoje</p>
              <p className="font-display text-2xl font-bold text-gray-900">4</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="font-display text-lg text-gray-900">Destaques prioritarios</CardTitle>
            <CardDescription>Itens que pedem acao rapida ou orientam seu proximo passo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {unreadNotifications.map((notification) => (
              <div key={notification.title} className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50">
                      <notification.icon className="h-5 w-5 text-[#10B981]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{notification.title}</h3>
                      <p className="mt-1 text-sm text-gray-600">{notification.description}</p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700">Novo</Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{notification.time}</span>
                  <Button variant="ghost" size="sm" className="text-[#10B981] hover:text-[#059669]">
                    Abrir
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-[#10B981] to-[#059669] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="font-display text-lg">Resumo rapido</CardTitle>
              <CardDescription className="text-emerald-50">
                Priorize avisos ligados a prazo, constancia e vitrine do perfil.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Categoria mais sensivel</p>
                <p className="mt-2 text-sm font-semibold">Entregas de sala e metas pessoais</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Visibilidade</p>
                <p className="mt-2 text-sm font-semibold">Seu perfil tambem pode virar um canal de oportunidades.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Mais recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentNotifications.map((item) => (
                <div key={item} className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Atalhos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/aluno/plano">Abrir plano de estudos</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/aluno/configuracoes">Ajustar preferencias</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
