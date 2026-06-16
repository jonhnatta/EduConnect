"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  CheckCircle2,
  BookOpen,
  Heart,
  Eye,
  ExternalLink,
  FileText,
  Dumbbell,
  ClipboardList,
  Lightbulb,
  BarChart2,
  Loader2,
} from "lucide-react"
import { getProfessorProfile } from "@/app/actions/professors"
import type { ProfessorProfile, ProfessorPost } from "@/app/actions/professors"

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatCount(n: number): string {
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
  article:    { label: "Artigo",    icon: <FileText className="h-4 w-4" />,      color: "bg-blue-50 text-blue-600" },
  exercise:   { label: "Exercício", icon: <Dumbbell className="h-4 w-4" />,      color: "bg-amber-50 text-amber-600" },
  assessment: { label: "Prova",     icon: <ClipboardList className="h-4 w-4" />, color: "bg-red-50 text-red-600" },
  simulado:   { label: "Simulado",  icon: <BarChart2 className="h-4 w-4" />,     color: "bg-purple-50 text-purple-600" },
  dica:       { label: "Dica",      icon: <Lightbulb className="h-4 w-4" />,     color: "bg-green-50 text-green-600" },
}

function PostItem({ post }: { post: ProfessorPost }) {
  const cfg = TYPE_CONFIG[post.type] ?? TYPE_CONFIG.article
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          {cfg.label}
        </p>
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
          {post.title}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {formatCount(post.like_count)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {formatCount(post.view_count)}
          </span>
          {post.published_at && (
            <span>{formatDate(post.published_at)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-4 px-6 pt-4">
      <div className="h-32 bg-gray-100 rounded-xl" />
      <div className="flex gap-3">
        <div className="h-16 w-16 rounded-full bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-5 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
      </div>
      <div className="border-t border-gray-100 pt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-9 w-9 rounded-lg bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-100 rounded w-1/4" />
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  slugOrId: string | null
  onClose: () => void
}

export function ProfessorSheet({ slugOrId, onClose }: Props) {
  const [profile, setProfile] = useState<ProfessorProfile | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!slugOrId) {
      setProfile(null)
      return
    }
    setProfile(null)
    startTransition(async () => {
      const data = await getProfessorProfile(slugOrId)
      setProfile(data)
    })
  }, [slugOrId])

  const isOpen = !!slugOrId

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col overflow-hidden"
      >
        {/* Título acessível (visualmente oculto, lido por screen readers) */}
        <SheetHeader className="sr-only">
          <SheetTitle>
            {profile ? `Perfil de ${profile.full_name}` : "Carregando perfil"}
          </SheetTitle>
        </SheetHeader>

        {isPending || !profile ? (
          <div className="flex-1 overflow-y-auto">
            {isPending ? (
              <ProfileSkeleton />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Carregando perfil...</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Cover */}
            {profile.cover_url ? (
              <img
                src={profile.cover_url}
                alt=""
                className="w-full h-28 object-cover"
              />
            ) : (
              <div className="w-full h-28 bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8]" />
            )}

            <div className="px-6 -mt-10 pb-6">
              {/* Avatar + nome */}
              <div className="flex items-end gap-4 mb-4">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="h-20 w-20 rounded-full object-cover border-4 border-white shadow shrink-0"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full border-4 border-white shadow bg-gradient-to-tr from-blue-100 to-indigo-50 text-[#1D4ED8] flex items-center justify-center font-display font-bold text-2xl shrink-0">
                    {initials(profile.full_name)}
                  </div>
                )}
                <div className="pb-1 min-w-0">
                  <h2 className="font-display font-bold text-lg text-gray-900 flex items-center gap-1.5 leading-tight">
                    <span className="truncate">{profile.full_name}</span>
                    <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
                  </h2>
                </div>
              </div>

              {/* Disciplinas */}
              {profile.interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {profile.interests.map((i) => (
                    <Badge key={i} variant="secondary" className="bg-blue-50 text-blue-700 border-0">
                      {i}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Bio */}
              {profile.bio && (
                <p className="text-sm text-gray-600 leading-relaxed mb-5">
                  {profile.bio}
                </p>
              )}

              {/* Stats */}
              <div className="flex gap-6 py-4 border-y border-gray-100 mb-5">
                <div className="text-center">
                  <p className="font-display font-bold text-xl text-gray-900">
                    {profile.post_count}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 justify-center mt-0.5">
                    <BookOpen className="h-3 w-3" /> Publicações
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-display font-bold text-xl text-gray-900">
                    {formatCount(profile.total_likes)}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 justify-center mt-0.5">
                    <Heart className="h-3 w-3" /> Curtidas
                  </p>
                </div>
              </div>

              {/* Publicações */}
              {profile.posts.length > 0 ? (
                <>
                  <h3 className="font-display font-semibold text-sm text-gray-900 mb-3">
                    Publicações em destaque
                  </h3>
                  <div className="space-y-1 mb-6">
                    {profile.posts.map((post) => (
                      <PostItem key={post.id} post={post} />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6 mb-6">
                  Nenhuma publicação ainda.
                </p>
              )}

              {/* Botão ver perfil completo */}
              <Button
                asChild
                className="w-full bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
              >
                <Link href={`/professor/${profile.slug}`} onClick={onClose}>
                  Ver perfil completo
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
