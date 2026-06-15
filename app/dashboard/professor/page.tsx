export const revalidate = 0

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Eye,
  Heart,
  Users,
  FileText,
  Clock,
  CheckCircle2,
  ChevronRight,
  Plus,
  Bell,
  Sparkles,
} from "lucide-react"
import {
  getProfessorViewStats,
  listMyContentItemsForProfessor,
} from "@/app/actions/content-items"
import { getProfessorPendingActivities } from "@/app/actions/classrooms"
import { listMyReviewedContent } from "@/app/actions/content-review"
import { requireAuthedUser } from "@/lib/auth/user"
import { queryOne } from "@/lib/db/query"

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return "Ha menos de 1h"
  if (h < 24) return `Ha ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return "Ha 1 dia"
  if (d < 7) return `Ha ${d} dias`
  return `Ha ${Math.floor(d / 7)} semana${Math.floor(d / 7) > 1 ? "s" : ""}`
}

export default async function ProfessorFeedPage() {
  const user = await requireAuthedUser().catch(() => null)
  const profile = user
    ? await queryOne<{ full_name: string | null }>(
        "select full_name from public.profiles where id = $1",
        [user.id]
      ).catch(() => null)
    : null
  const firstName = profile?.full_name?.split(" ")[0] ?? "Professor"

  const [viewStats, recentContent, pendingResult, allReviews] = await Promise.all([
    getProfessorViewStats(),
    listMyContentItemsForProfessor(),
    getProfessorPendingActivities(),
    listMyReviewedContent(),
  ])

  const recentPosts = recentContent.slice(0, 5)
  const pendingActivities = pendingResult.activities
  const pendingReviews = allReviews.filter((r) => r.status === "aguardando_decisao")

  const stats = [
    { label: "Visualizacoes", value: formatCount(viewStats.totalViews), icon: Eye },
    { label: "Seguidores", value: "—", icon: Users },
    { label: "Publicacoes", value: String(viewStats.totalPublications), icon: FileText },
    { label: "Curtidas", value: formatCount(viewStats.totalLikes), icon: Heart },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Ola, {firstName}!</h1>
          <p className="text-gray-600">Veja como seus conteudos estao performando</p>
        </div>
        <Button asChild className="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2">
          <Link href="/dashboard/professor/criar">
            <Plus className="h-4 w-4" />
            Criar Conteudo
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-2xl font-bold font-display text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Publicações recentes — dados reais */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">Minhas Publicacoes</h2>
              <Link href="/dashboard/professor/conteudos" className="text-sm text-[#1D4ED8] hover:underline flex items-center gap-1">
                Ver todas <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {recentPosts.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Nenhum conteudo publicado ainda.{" "}
                  <Link href="/dashboard/professor/criar" className="text-[#1D4ED8] hover:underline">
                    Criar conteudo
                  </Link>
                </div>
              ) : (
                recentPosts.map((post) => (
                  <div key={post.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 truncate">{post.title}</h3>
                          <Badge
                            variant={post.status === "published" ? "default" : "secondary"}
                            className={post.status === "published" ? "bg-[#10B981]" : "bg-amber-100 text-amber-800"}
                          >
                            {post.status === "published" ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Publicado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {post.status === "verificando" ? "Em revisao" : post.status}
                              </span>
                            )}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>{post.type}</span>
                          <span>{relativeTime(post.updated_at)}</span>
                        </div>
                      </div>
                      {post.status === "published" && (
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Eye className="h-4 w-4" />
                            {post.view_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-4 w-4" />
                            {post.like_count}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Atividades Pendentes — dados reais */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">Atividades Pendentes</h2>
              <Link href="/dashboard/professor/salas" className="text-sm text-[#1D4ED8] hover:underline flex items-center gap-1">
                Ver salas <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingActivities.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Nenhuma atividade com entregas pendentes.{" "}
                  <Link href="/dashboard/professor/salas" className="text-[#1D4ED8] hover:underline">
                    Crie uma sala
                  </Link>{" "}
                  para comecar.
                </div>
              ) : (
                pendingActivities.map((activity) => (
                  <div key={activity.activityId} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{activity.activityTitle}</h3>
                        <p className="text-sm text-gray-500">
                          {activity.classroomName}
                          {activity.subject ? ` — ${activity.subject}` : ""}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-semibold text-[#1D4ED8]">
                          {activity.enviados}/{activity.total}
                        </div>
                        <p className="text-xs text-gray-500">entregas</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" asChild>
                        <Link href={`/dashboard/professor/salas/${activity.classroomId}/atividades/${activity.activityId}`}>
                          Ver entregas
                        </Link>
                      </Button>
                      <Button size="sm" className="flex-1 bg-[#1D4ED8] hover:bg-[#1E3A8A]" asChild>
                        <Link href={`/dashboard/professor/salas/${activity.classroomId}/atividades/${activity.activityId}`}>
                          Corrigir
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Revisões IA aguardando decisão — só mostra se houver */}
          {pendingReviews.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200">
              <div className="p-4 border-b border-amber-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="font-display font-semibold text-gray-900">Revisoes IA pendentes</h2>
                <Badge className="bg-amber-100 text-amber-800 ml-auto">{pendingReviews.length}</Badge>
              </div>
              <div className="divide-y divide-gray-100">
                {pendingReviews.slice(0, 3).map((item) => (
                  <div key={item.id} className="p-4">
                    <h3 className="text-sm font-medium text-gray-900 truncate mb-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 mb-2">Score IA: {item.score}</p>
                    <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-600" asChild>
                      <Link href={`/dashboard/professor/criar?edit=${encodeURIComponent(item.id)}`}>
                        Decidir
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notificações — task #17 */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
              <Bell className="h-4 w-4 text-gray-400" />
              <h2 className="font-display font-semibold text-gray-900">Notificacoes</h2>
            </div>
            <div className="p-6 text-center text-sm text-gray-400">
              Notificacoes em breve.
            </div>
          </div>

          {/* Destaques com dados reais */}
          <div className="bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] rounded-xl p-4 text-white">
            <h3 className="font-semibold mb-4">Destaques</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-blue-100">Total de views</span>
                <span className="font-medium">{formatCount(viewStats.totalViews)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-100">Total de curtidas</span>
                <span className="font-medium">{formatCount(viewStats.totalLikes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-100">Publicacoes ativas</span>
                <span className="font-medium">{viewStats.totalPublications}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
