"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, FileText, Users, UserPlus, UserCheck, Rss } from "lucide-react"
import { toggleProfessorFollow } from "@/app/actions/follows"
import type { CommunityFeedItem } from "@/app/actions/content-items"

const TYPE_LABEL: Record<string, string> = {
  article: "Artigo",
  exercise: "Exercicio",
  assessment: "Avaliacao",
  simulado: "Simulado",
  dica: "Dica",
}

function initials(name: string | null) {
  if (!name) return "P"
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "P"
}

function excerpt(html: string | null): string {
  if (!html) return ""
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220)
}

export function ProfessorCommunityFeed({ items }: { items: CommunityFeedItem[] }) {
  const [following, setFollowing] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    for (const it of items) o[it.author_id] = it.is_following
    return o
  })
  const [pendingId, startTransition] = useTransition()

  function handleFollow(authorId: string) {
    const prev = following[authorId] ?? false
    setFollowing((s) => ({ ...s, [authorId]: !prev })) // otimista
    startTransition(async () => {
      const res = await toggleProfessorFollow(authorId)
      if (!res.ok) {
        setFollowing((s) => ({ ...s, [authorId]: prev })) // reverte
        toast.error(res.error)
        return
      }
      setFollowing((s) => ({ ...s, [authorId]: res.following }))
      toast.success(res.following ? "Seguindo!" : "Deixou de seguir")
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
        <Rss className="mx-auto mb-4 h-12 w-12 text-gray-200" />
        <p className="font-medium text-gray-900">Nenhuma publicacao na comunidade ainda</p>
        <p className="mt-1 text-sm text-gray-500">
          Quando outros professores publicarem conteudo publico, voce vera por aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((it) => {
        const isFollowing = following[it.author_id] ?? false
        const cover = it.settings?.coverUrl ?? (it.settings?.dicaImageUrls?.[0] ?? null)
        return (
          <article key={it.id} className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={it.author.avatar_url || ""} />
                  <AvatarFallback className="bg-[#1D4ED8] text-white text-sm">
                    {initials(it.author.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  {it.author_slug ? (
                    <Link
                      href={`/professor/${it.author_slug}`}
                      className="font-medium text-gray-900 hover:underline truncate block"
                    >
                      {it.author.full_name ?? "Professor"}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900 truncate block">
                      {it.author.full_name ?? "Professor"}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {it.published_at ? new Date(it.published_at).toLocaleDateString("pt-BR") : ""}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isFollowing ? "outline" : "default"}
                className={isFollowing ? "border-gray-200 gap-1.5" : "bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-1.5"}
                disabled={pendingId}
                onClick={() => handleFollow(it.author_id)}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="h-4 w-4" /> Seguindo
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> Seguir
                  </>
                )}
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-50 text-[#1D4ED8] gap-1">
                {it.type === "article" ? <FileText className="h-3 w-3" /> : it.type === "dica" ? <BookOpen className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {TYPE_LABEL[it.type] ?? it.type}
              </Badge>
              {it.audience === "teachers" ? (
                <Badge className="bg-violet-50 text-violet-700">So professores</Badge>
              ) : null}
            </div>

            <h3 className="mt-2 font-display text-lg font-semibold text-gray-900">{it.title}</h3>
            {excerpt(it.body_html) ? (
              <p className="mt-1 text-sm text-gray-600 line-clamp-3">{excerpt(it.body_html)}</p>
            ) : null}
            {cover ? (
              <div className="mt-3 rounded-lg overflow-hidden border border-gray-100 max-h-64">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt={it.title} className="w-full object-cover" />
              </div>
            ) : null}

            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link href={`/conteudo/${it.id}`}>Ver publicacao</Link>
              </Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
