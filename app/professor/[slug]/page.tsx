import { notFound } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  BookOpen,
  ChevronLeft,
  FileText,
  Dumbbell,
  ClipboardList,
  BarChart2,
  Lightbulb,
  Heart,
  Eye,
} from "lucide-react"
import { getProfessorProfile } from "@/app/actions/professors"
import { getFollowState } from "@/app/actions/follows"
import { FollowButton } from "./_follow-button"

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function formatDate(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  article:    { label: "Artigo",    icon: <FileText className="h-5 w-5" />,      color: "bg-blue-50 text-blue-600" },
  exercise:   { label: "Exercício", icon: <Dumbbell className="h-5 w-5" />,      color: "bg-amber-50 text-amber-600" },
  assessment: { label: "Prova",     icon: <ClipboardList className="h-5 w-5" />, color: "bg-red-50 text-red-600" },
  simulado:   { label: "Simulado",  icon: <BarChart2 className="h-5 w-5" />,     color: "bg-purple-50 text-purple-600" },
  dica:       { label: "Dica",      icon: <Lightbulb className="h-5 w-5" />,     color: "bg-green-50 text-green-600" },
}

export default async function PerfilProfessorPublico({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const [profile, followState] = await Promise.all([
    getProfessorProfile(slug),
    getFollowState(slug).catch(() => ({ following: false, followersCount: 0 })),
  ])

  if (!profile) notFound()

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Voltar */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        <Link
          href="/dashboard/aluno/explorar"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Explorar Professores
        </Link>
      </div>

      {/* Cover */}
      {profile.cover_url ? (
        <img src={profile.cover_url} alt="" className="w-full h-48 md:h-64 object-cover" />
      ) : (
        <div className="h-48 md:h-64 bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8]" />
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-20">
        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-8 relative">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar */}
            <div className="relative -mt-16 sm:-mt-20 mx-auto sm:mx-0 shrink-0">
              <div className="h-32 w-32 md:h-40 md:w-40 bg-white rounded-full p-2 border border-gray-100 shadow-md">
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-blue-100 to-indigo-50 flex items-center justify-center text-[#1D4ED8] font-display font-bold text-4xl overflow-hidden">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    initials(profile.full_name)
                  )}
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left mt-2 sm:mt-0">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 flex items-center justify-center sm:justify-start gap-2">
                    {profile.full_name}
                    <CheckCircle2 className="h-5 w-5 text-[#10B981] mt-1 shrink-0" />
                  </h1>
                  {profile.interests.length > 0 && (
                    <p className="text-gray-500 font-medium mt-1">
                      {profile.interests.slice(0, 3).join(" · ")}
                    </p>
                  )}
                </div>

                {/* Botão Seguir — island client */}
                <FollowButton
                  teacherId={profile.id}
                  initialFollowing={followState.following}
                  initialCount={followState.followersCount}
                />
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  {profile.bio}
                </p>
              )}

              {/* Métricas */}
              <div className="flex items-center justify-center sm:justify-start gap-6 pt-4 border-t border-gray-100">
                <div>
                  <div className="font-display font-bold text-xl text-gray-900">
                    {profile.post_count}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> Publicações
                  </div>
                </div>
                <div>
                  <div className="font-display font-bold text-xl text-gray-900">
                    {formatCount(profile.total_likes)}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Heart className="h-3 w-3" /> Curtidas
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Sidebar */}
          <div className="md:col-span-1 space-y-6">
            {profile.bio && (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="font-display font-semibold text-gray-900 mb-3">Sobre</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {profile.interests.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="font-display font-semibold text-gray-900 mb-3">Disciplinas</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((i) => (
                    <Badge key={i} variant="secondary" className="bg-blue-50 text-blue-700 border-0">
                      {i}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Publicações */}
          <div className="md:col-span-2">
            <h2 className="font-display font-semibold text-lg text-gray-900 mb-4">
              Publicações em destaque
            </h2>

            {profile.posts.length > 0 ? (
              <div className="space-y-3">
                {profile.posts.map((post) => {
                  const cfg = TYPE_CONFIG[post.type] ?? TYPE_CONFIG.article
                  return (
                    <div
                      key={post.id}
                      className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#1D4ED8]/30 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              {cfg.label}
                            </span>
                            {post.published_at && (
                              <span className="text-xs text-gray-400">
                                {formatDate(post.published_at)}
                              </span>
                            )}
                          </div>
                          <h3 className="font-medium text-gray-900 leading-snug mb-2">
                            {post.title}
                          </h3>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <Heart className="h-3.5 w-3.5" /> {formatCount(post.like_count)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" /> {formatCount(post.view_count)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
                Nenhuma publicação ainda.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
