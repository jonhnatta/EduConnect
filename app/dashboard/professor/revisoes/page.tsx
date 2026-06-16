import Link from "next/link"
import { listMyReviewedContent } from "@/app/actions/content-review"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireApprovedProfessorAccess } from "@/lib/auth/guards"
import { AlertTriangle, Bot, CheckCircle2, Clock3, Sparkles } from "lucide-react"

function typeLabel(type: string) {
  switch (type) {
    case "assessment":
      return "Avaliacao"
    case "exercise":
      return "Exercicio"
    case "simulado":
      return "Simulado"
    case "dica":
      return "Dica"
    default:
      return "Artigo"
  }
}

export default async function ProfessorRevisoesPage() {
  await requireApprovedProfessorAccess()
  const items = await listMyReviewedContent()

  const pending = items.filter((item) => item.status === "aguardando_decisao")
  const published = items.filter((item) => item.status === "published")
  const needsRevision = items.filter((item) => item.status === "revisao" || item.status === "verificando")
  const avgScore = items.length > 0 ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0

  return (
    <div className="mx-auto max-w-6xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#1D4ED8]">
            Fluxo de qualidade do professor
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Revisoes pela IA</h1>
          <p className="mt-1 text-sm text-gray-500">
            Uma central dedicada para decidir, acompanhar score e entender gargalos antes da publicacao.
          </p>
        </div>
        <Button asChild className="bg-[#1D4ED8] hover:bg-[#1E3A8A]">
          <Link href="/dashboard/professor/criar">Criar novo conteudo</Link>
        </Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Clock3 className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Aguardando decisao</p>
              <p className="font-display text-2xl font-bold text-gray-900">{pending.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <CheckCircle2 className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Publicados</p>
              <p className="font-display text-2xl font-bold text-gray-900">{published.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <AlertTriangle className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pedem revisao</p>
              <p className="font-display text-2xl font-bold text-gray-900">{needsRevision.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Sparkles className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Score medio</p>
              <p className="font-display text-2xl font-bold text-gray-900">{avgScore}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="font-display text-lg text-gray-900">Fila principal</CardTitle>
            <CardDescription>Itens revisados pela IA em um layout mais direcionado para tomada de decisao.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
                <Bot className="mx-auto h-10 w-10 text-[#1D4ED8]" />
                <p className="mt-4 font-medium text-gray-900">Nenhuma revisao disponivel ainda</p>
                <p className="mt-2 text-sm text-gray-600">
                  Assim que o agente analisar conteudos, esta central passa a concentrar score, pendencias e decisoes.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-700">{typeLabel(item.type)}</Badge>
                    <Badge className={item.status === "aguardando_decisao" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                      {item.status}
                    </Badge>
                    <Badge className="bg-gray-100 text-gray-700">Score {item.score}</Badge>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {item.warningReason || "Sem alerta critico. Use a lista de findings para ajustes finos ou decisao final."}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                    <span>{new Date(item.reviewedAt).toLocaleString("pt-BR")}</span>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/professor/criar?edit=${encodeURIComponent(item.id)}`}>Abrir revisao</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="font-display text-lg">Leitura do pipeline</CardTitle>
              <CardDescription className="text-blue-100">
                Um resumo visual do estado atual do seu funil de revisao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-100">Decisao pendente</p>
                <p className="mt-2 text-sm font-semibold">
                  {pending.length > 0
                    ? "Existem conteudos pedindo sua aprovacao final."
                    : "Nenhum conteudo travado aguardando aval."}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-100">Qualidade media</p>
                <p className="mt-2 text-sm font-semibold">
                  {avgScore >= 80 ? "Seu padrao atual esta forte." : "Ha espaco para elevar consistencia antes de publicar."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Uso rapido</CardTitle>
              <CardDescription>Atalhos que combinam com a rotina de revisao.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/conteudos">Abrir meus conteudos</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/analise">Ver analise geral</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/professor/configuracoes">Ajustar preferencias</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
