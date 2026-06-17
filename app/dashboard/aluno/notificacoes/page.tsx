import Link from "next/link"
import { Bell, BookOpen, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { getMyNotifications } from "@/app/actions/notifications"
import { NotificationsClient } from "@/components/dashboard/notifications-client"
import { NotificationsList } from "@/components/dashboard/notifications-list"

export const dynamic = "force-dynamic"

export default async function AlunoNotificacoesPage() {
  const { notifications, unreadCount, total, byType, hasMore } = await getMyNotifications(20)

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
                {byType.new_content ?? 0}
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
                {byType.activity_graded ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {total === 0 ? (
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
              <CardDescription>Clique para marcar como lida. Mais recentes primeiro.</CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationsList initial={notifications} initialHasMore={hasMore} accent="green" />
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
