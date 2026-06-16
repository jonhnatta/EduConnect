import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, Bot, CheckCheck, FileWarning, Users } from "lucide-react"

const priorityItems = [
  {
    title: "Conteudo com decisao pendente da IA",
    description: "Um artigo revisado ficou entre as faixas que exigem sua avaliacao final antes de publicar.",
    time: "Ha 18 min",
    icon: Bot,
  },
  {
    title: "Novas entregas aguardando correcao",
    description: "Alunos enviaram atividades em duas salas diferentes e o painel pede revisao.",
    time: "Ha 45 min",
    icon: Users,
  },
  {
    title: "Perfil publico pode ser fortalecido",
    description: "Atualize capa, bio e areas de especialidade para aumentar descoberta por alunos.",
    time: "Hoje",
    icon: FileWarning,
  },
]

export default function ProfessorNotificacoesPage() {
  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#1D4ED8]">
            Central de notificacoes
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Notificacoes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Um mockup alinhado ao painel do professor para concentrar alertas de IA, salas e operacao.
          </p>
        </div>
        <Button variant="outline">Marcar tudo como lido</Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Bell className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Nao lidas</p>
              <p className="font-display text-2xl font-bold text-gray-900">{priorityItems.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Bot className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">IA e publicacao</p>
              <p className="font-display text-2xl font-bold text-gray-900">2 alertas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <CheckCheck className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Acoes concluidas</p>
              <p className="font-display text-2xl font-bold text-gray-900">5 hoje</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="font-display text-lg text-gray-900">Fila prioritaria</CardTitle>
            <CardDescription>Alertas que devem orientar sua proxima decisao operacional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {priorityItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
                      <item.icon className="h-5 w-5 text-[#1D4ED8]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                      <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700">Novo</Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{item.time}</span>
                  <Button variant="ghost" size="sm" className="text-[#1D4ED8] hover:text-[#1E3A8A]">
                    Abrir
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="font-display text-lg">Resumo rapido</CardTitle>
              <CardDescription className="text-blue-100">
                O sino passa a ter uma pagina coerente com o fluxo de operacao do professor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-100">Foco imediato</p>
                <p className="mt-2 text-sm font-semibold">Decisoes de IA e correcao de entregas.</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-100">Foco estrategico</p>
                <p className="mt-2 text-sm font-semibold">Fortalecer perfil e ritmo de publicacao.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Atalhos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/revisoes">Abrir revisoes pela IA</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/salas">Ir para minhas salas</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/configuracoes">Ajustar alertas</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
