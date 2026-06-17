import Link from "next/link"
import { Bell, BookOpen, Users, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { getMyNotifications } from "@/app/actions/notifications"
import { NotificationsClient } from "@/components/dashboard/notifications-client"

export const dynamic = "force-dynamic"

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  new_content: { label: "Novo conteudo", icon: <BookOpen className="h-5 w-5" />, color: "bg-emerald-50 text-emerald-600" },
  new_follower: { label: "Seguidor", icon: <Users className="h-5 w-5" />, color: "bg-blue-50 text-blue-600" },
  activity_graded: { label: "Correcao", icon: <CheckCheck className="h-5 w-5" />, color: "bg-amber-50 text-amber-600" },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `Ha ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Ha ${hrs} h`
  return `Ha ${Math.floor(hrs / 24)} dia${Math.floor(hrs / 24) !== 1 ? "s" : ""}`
}

export default async function AlunoNotificacoesPage() {
  const { notifications, unreadCount } = await getMyNotifications(50)

  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-[#059669]">
            Central de notificacoes
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Notificacoes</h1>
          <p className="mt-1 text-sm text-gray-500">Atualizacoes de professores que voce segue e das suas salas.</p>
        </div>
        {unreadCount > 0 && <NotificationsClient />}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <Bell className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Nao lidas</p>
              <p className="font-display text-2xl font-bold text-gray-900">{unreadCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <BookOpen className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Novos conteudos</p>
              <p className="font-display text-2xl font-bold text-gray-900">
                {notifications.filter((n) => n.type === "new_content").length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <CheckCheck className="h-6 w-6 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Correcoes</p>
              <p className="font-display text-2xl font-bold text-gray-900">
                {notifications.filter((n) => n.type === "activity_graded").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Bell className="mx-auto mb-4 h-12 w-12 text-gray-200" />
          <p className="font-medium text-gray-900">Nenhuma notificacao ainda</p>
          <p className="mt-1 text-sm text-gray-500">Quando professores publicarem conteudo, voce sera notificado aqui.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/dashboard/aluno/explorar">Explorar professores</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="font-display text-lg text-gray-900">Todas as notificacoes</CardTitle>
              <CardDescription>Mais recentes primeiro.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifications.map((n) => {
                const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.new_content
                return (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-4 transition-colors ${n.read_at ? "border-gray-100 bg-white" : "border-emerald-100 bg-emerald-50/40"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.color}`}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{n.message}</p>
                          {!n.read_at && <Badge className="bg-emerald-100 text-emerald-700 shrink-0">Novo</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-0 bg-gradient-to-br from-[#10B981] to-[#059669] text-white shadow-lg">
              <CardHeader>
                <CardTitle className="font-display text-lg">Atalhos rapidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                  <Link href="/dashboard/aluno/explorar">Explorar professores</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                  <Link href="/dashboard/aluno/plano">Ir para plano de estudos</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                  <Link href="/dashboard/aluno/configuracoes">Ajustar preferencias</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
