import { notFound } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  BookOpen,
  ChevronLeft,
  Heart,
  Globe,
  GraduationCap,
  Users,
} from "lucide-react"
import { getProfessorProfile } from "@/app/actions/professors"
import { getFollowState } from "@/app/actions/follows"
import { getProfessorReviews } from "@/app/actions/professor-reviews"
import { FollowButton } from "./_follow-button"
import { PublicProfileTabs } from "./_public-profile-tabs"

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

export default async function PerfilProfessorPublico({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const profile = await getProfessorProfile(slug)

  if (!profile) notFound()

  const followState = await getFollowState(profile.id).catch(() => ({ following: false, followersCount: 0 }))
  const reviews = await getProfessorReviews(profile.id).catch(() => ({
    average: 0,
    count: 0,
    reviews: [],
    myReview: null,
    canReview: false,
  }))

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
                <Link
                  href={`/denunciar?targetType=profile&targetId=${profile.id}&returnTo=${encodeURIComponent(`/professor/${slug}`)}`}
                  className="text-xs text-red-700 hover:underline"
                >
                  Denunciar perfil
                </Link>
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
                    {formatCount(followState.followersCount)}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Seguidores
                  </div>
                </div>
                <div>
                  <div className="font-display font-bold text-xl text-gray-900">
                    {formatCount(profile.students_count)}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <GraduationCap className="h-3 w-3" /> Alunos
                  </div>
                </div>
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

            {profile.levels.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="font-display font-semibold text-gray-900 mb-3">Niveis</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.levels.map((level) => (
                    <Badge key={level} variant="secondary" className="bg-gray-100 text-gray-700 hover:bg-gray-200">
                      {level}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {profile.website_url ? (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="font-display font-semibold text-gray-900 mb-3">Site</h3>
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#1D4ED8] hover:underline"
                >
                  <Globe className="h-4 w-4" />
                  {profile.website_url}
                </a>
              </div>
            ) : null}
          </div>

          {/* Publicações */}
          <div className="md:col-span-2">
            <PublicProfileTabs posts={profile.posts} teacherId={profile.id} reviews={reviews} />
          </div>
        </div>
      </div>
    </div>
  )
}
