import Link from "next/link"
import { Bell, Users, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { getMyNotifications } from "@/app/actions/notifications"
import { NotificationsClient } from "@/components/dashboard/notifications-client"
import { NotificationsList } from "@/components/dashboard/notifications-list"

export const dynamic = "force-dynamic"

export default async function ProfessorNotificacoesPage() {
  const { notifications, unreadCount, total, byType, hasMore } = await getMyNotifications(20)

  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#1D4ED8]">
            Central de notificacoes
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Notificacoes</h1>
          <p className="mt-1 text-sm text-gray-500">Novos seguidores, curtidas e comentarios nas suas publicacoes.</p>
        </div>
        {unreadCount > 0 && <NotificationsClient accent="blue" />}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Bell className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Nao lidas</p>
              <p className="font-display text-2xl font-bold text-gray-900">{unreadCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Users className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Novos seguidores</p>
              <p className="font-display text-2xl font-bold text-gray-900">
                {byType.new_follower ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <BookOpen className="h-6 w-6 text-[#1D4ED8]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total recebidas</p>
              <p className="font-display text-2xl font-bold text-gray-900">{total}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Bell className="mx-auto mb-4 h-12 w-12 text-gray-200" />
          <p className="font-medium text-gray-900">Nenhuma notificacao ainda</p>
          <p className="mt-1 text-sm text-gray-500">Quando alguem seguir, curtir ou comentar seu conteudo, voce vera aqui.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/dashboard/professor/salas">Ver minhas salas</Link>
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
              <NotificationsList initial={notifications} initialHasMore={hasMore} accent="blue" />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-0 bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] text-white shadow-lg">
              <CardHeader>
                <CardTitle className="font-display text-lg">Atalhos rapidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                  <Link href="/dashboard/professor/salas">Ir para minhas salas</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                  <Link href="/dashboard/professor/seguidores">Ver seguidores</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start text-white hover:bg-white/10">
                  <Link href="/dashboard/professor/configuracoes">Ajustar preferencias</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
