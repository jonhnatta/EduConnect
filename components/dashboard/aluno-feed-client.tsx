"use client"

import type { FeedContentItem } from "@/app/actions/content-items"
import type { ContentComment } from "@/app/actions/content-items"
import { recordContentShare, toggleContentLike, toggleContentSave } from "@/app/actions/content-items"
import { ArticleCoverMedia } from "@/components/dashboard/article-cover-media"
import { CardInlineComments } from "@/components/dashboard/card-inline-comments"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Share2,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { parseExamFromSettings } from "@/lib/activities/exam"
import { parseAssessmentSettings } from "@/lib/content/assessment-settings"

type TodayItem = {
  id: string
  title: string
  isDone: boolean
  href: string | null
  kind: "personal" | "classroom"
}

type WeekStats = {
  personalDone: number
  personalTotal: number
  classroomSubmitted: number
  classroomActivitiesInWeek: number
}

function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return parts[0].slice(0, 2).toUpperCase()
}

const EXCERPT_MAX = 600

const FEED_CATEGORIAS: { key: string; label: string; types?: string[] }[] = [
  { key: "todos", label: "Todos" },
  { key: "artigos", label: "Artigos", types: ["article"] },
  { key: "exercicios", label: "Exercícios", types: ["exercise"] },
  { key: "provas", label: "Provas", types: ["assessment", "simulado"] },
  { key: "dicas", label: "Dicas", types: ["dica"] },
]

function plainText(html: string | null | undefined): string {
  if (!html?.trim()) return ""
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

type Props = {
  initialArticles?: FeedContentItem[]
  initialLikedIds?: string[]
  initialSavedIds?: string[]
  initialCommentPreviews?: Record<string, ContentComment[]>
  viewerUserId?: string | null
  todayItems?: TodayItem[]
  streakDays?: number
  todayProgress?: number
  weekStats?: WeekStats
}

export function AlunoFeedClient({
  initialArticles = [],
  initialLikedIds = [],
  initialSavedIds = [],
  initialCommentPreviews = {},
  viewerUserId = null,
  todayItems = [],
  streakDays = 0,
  todayProgress = 0,
  weekStats,
}: Props) {
  const router = useRouter()
  const [categoria, setCategoria] = useState<string>("todos")
  const visibleArticles =
    categoria === "todos"
      ? initialArticles
      : initialArticles.filter((a) => FEED_CATEGORIAS.find((c) => c.key === categoria)?.types?.includes(a.type))
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    for (const id of initialSavedIds) o[id] = true
    return o
  })
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    for (const id of initialLikedIds) o[id] = true
    return o
  })
  const [counts, setCounts] = useState<Record<string, { likes: number; shares: number; comments: number }>>(() => {
    const o: Record<string, { likes: number; shares: number; comments: number }> = {}
    for (const a of initialArticles) {
      o[a.id] = { likes: a.like_count, shares: a.share_count, comments: a.comment_count }
    }
    return o
  })

  const updateCommentCount = (id: string, count: number) => {
    setCounts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { likes: 0, shares: 0, comments: 0 }), comments: count },
    }))
  }

  const onSave = async (articleId: string) => {
    const res = await toggleContentSave(articleId)
    if (!res.ok) {
      if (res.error === "Nao autenticado") {
        toast.message("Entre na conta para salvar")
      } else {
        toast.error(res.error)
      }
      return
    }
    setSavedMap((prev) => ({ ...prev, [articleId]: res.saved }))
  }

  const onLike = async (articleId: string) => {
    const res = await toggleContentLike(articleId)
    if (!res.ok) {
      if (res.error === "Nao autenticado") {
        toast.message("Entre na conta para curtir")
      } else {
        toast.error(res.error)
      }
      return
    }
    setLikedMap((prev) => ({ ...prev, [articleId]: res.liked }))
    setCounts((prev) => ({
      ...prev,
      [articleId]: { ...prev[articleId], likes: res.likeCount },
    }))
  }

  const onShare = async (articleId: string) => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/conteudo/${articleId}`
    try {
      if (navigator.share) {
        await navigator.share({ url })
        const r = await recordContentShare(articleId, "native_share")
        if (r.ok) {
          setCounts((prev) => ({
            ...prev,
            [articleId]: { ...prev[articleId], shares: r.shareCount },
          }))
        }
      } else {
        await navigator.clipboard.writeText(url)
        toast.success("Link copiado")
        const r = await recordContentShare(articleId, "copy_link")
        if (r.ok) {
          setCounts((prev) => ({
            ...prev,
            [articleId]: { ...prev[articleId], shares: r.shareCount },
          }))
        }
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url)
        toast.success("Link copiado")
        const r = await recordContentShare(articleId, "copy_link")
        if (r.ok) {
          setCounts((prev) => ({
            ...prev,
            [articleId]: { ...prev[articleId], shares: r.shareCount },
          }))
        }
      } catch {
        toast.error("Nao foi possivel copiar")
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-900">Ola!</h1>
        <p className="text-gray-600">Pronto para mais um dia de aprendizado?</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {FEED_CATEGORIAS.map((c) => (
              <Button
                key={c.key}
                size="sm"
                variant={categoria === c.key ? "default" : "outline"}
                className={categoria === c.key ? "bg-[#10B981] hover:bg-[#059669]" : ""}
                onClick={() => setCategoria(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {visibleArticles.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200 text-gray-500">
              Nenhum conteúdo nesta categoria ainda.
            </div>
          )}

          <div className="space-y-4">
            {visibleArticles.map((item) => {
              const c = counts[item.id] ?? { likes: item.like_count, shares: item.share_count, comments: item.comment_count }
              const liked = !!likedMap[item.id]
              const isExercise = item.type === "exercise"
              const isAssessment = item.type === "assessment"
              const isSimulado = item.type === "simulado"
              const isDica = item.type === "dica"
              const isExamLike = isExercise || isAssessment || isSimulado
              const qCount = isExamLike
                ? parseExamFromSettings(item.settings as Record<string, unknown>)
                    ?.questions.length ?? 0
                : 0
              const aset = parseAssessmentSettings(item.settings as Record<string, unknown>)
              const dueLine =
                (isAssessment || isSimulado) && aset.dueAt
                  ? `Prazo: ${new Date(aset.dueAt).toLocaleString("pt-BR")}`
                  : null
              const disciplina =
                item.settings?.disciplina ??
                (isSimulado
                  ? "Simulado"
                  : isAssessment
                    ? "Avaliacao"
                    : isExercise
                      ? "Exercicio"
                      : isDica
                        ? "Dica rapida"
                        : "Artigo")
              const dicaVid =
                isDica && item.settings && typeof item.settings === "object"
                  ? String(
                      (item.settings as { dicaVideoUrl?: string }).dicaVideoUrl ?? ""
                    ).trim() || null
                  : null
              const dicaImgs =
                isDica &&
                item.settings &&
                typeof item.settings === "object" &&
                Array.isArray((item.settings as { dicaImageUrls?: unknown }).dicaImageUrls)
                  ? ((item.settings as { dicaImageUrls: string[] }).dicaImageUrls ?? []).filter(
                      (x): x is string => typeof x === "string" && x.trim().length > 0
                    )
                  : []
              const cover = isDica
                ? dicaVid
                  ? null
                  : dicaImgs[0]?.trim() || null
                : item.settings?.coverUrl?.trim() || null
              const coverVideo = isExamLike
                ? null
                : isDica
                  ? dicaVid
                  : item.settings?.coverVideoUrl?.trim() || null
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {item.author.avatar_url ? (
                          <AvatarImage src={item.author.avatar_url} alt="" />
                        ) : null}
                        <AvatarFallback className="bg-[#1D4ED8] text-white text-sm">
                          {initials(item.author.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium text-gray-900">{item.author.full_name ?? "Professor"}</span>
                        <Badge variant="secondary" className="text-xs ml-2">
                          {disciplina}
                        </Badge>
                        {isExamLike ? (
                          <Badge variant="outline" className="text-xs ml-1">
                            {qCount} questoes
                          </Badge>
                        ) : null}
                        {isDica ? (
                          <Badge variant="outline" className="text-xs ml-1">
                            Dica rapida
                          </Badge>
                        ) : null}
                        {dueLine ? (
                          <span className="text-xs text-gray-500 ml-1 block sm:inline">
                            {dueLine}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-3">
                    <h3 className="font-display font-semibold text-lg text-gray-900 mb-1">{item.title}</h3>

                    {/* Descrição — max 600 chars */}
                    {(() => {
                      const text = plainText(item.body_html)
                      if (!text) return null
                      const truncated = text.length > EXCERPT_MAX
                      return (
                        <p className="text-sm text-gray-700 leading-relaxed mb-2">
                          {truncated ? text.slice(0, EXCERPT_MAX) : text}
                          {truncated ? (
                            <>
                              {"… "}
                              <Link
                                href={`/conteudo/${item.id}`}
                                className="font-semibold text-[#1D4ED8] hover:underline"
                              >
                                ver mais
                              </Link>
                            </>
                          ) : null}
                        </p>
                      )
                    })()}

                    <div className="flex items-center gap-2 text-sm text-[#10B981] mb-3">
                      <Sparkles className="h-4 w-4" />
                      <span>
                        {isSimulado
                          ? "Simulado publicado na plataforma"
                          : isAssessment
                            ? "Avaliacao publicada na plataforma"
                            : isExercise
                              ? "Exercicio publicado na plataforma"
                              : isDica
                                ? "Dica publicada na plataforma"
                                : "Artigo publicado na plataforma"}
                      </span>
                    </div>
                    <div className="bg-gray-100 rounded-lg aspect-video flex items-center justify-center mb-3 overflow-hidden">
                      {coverVideo || cover ? (
                        <ArticleCoverMedia
                          imageUrl={cover}
                          videoUrl={coverVideo}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          {isExamLike ? (
                            <ListChecks className="h-12 w-12" />
                          ) : isDica ? (
                            <Lightbulb className="h-12 w-12" />
                          ) : (
                            <BookOpen className="h-12 w-12" />
                          )}
                          <span className="text-sm flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {isExamLike
                              ? `${qCount} questoes`
                              : isDica
                                ? "Dica"
                                : "Leitura"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          className={`flex items-center gap-1 transition-colors ${liked ? "text-red-500" : "text-gray-600 hover:text-red-500"}`}
                          onClick={() => void onLike(item.id)}
                        >
                          <Heart
                            className={`h-5 w-5 shrink-0 ${liked ? "fill-red-500 stroke-red-500 text-red-500" : ""}`}
                          />
                          <span className="text-sm">{c.likes}</span>
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-gray-400 hover:text-[#1D4ED8] transition-colors text-sm"
                          onClick={() => {
                            document.getElementById(`comment-input-${item.id}`)?.focus()
                          }}
                        >
                          <MessageCircle className="h-5 w-5" />
                          <span>{c.comments}</span>
                        </button>
                        <button
                          type="button"
                          className="text-gray-600 hover:text-[#1D4ED8] transition-colors"
                          onClick={() => void onShare(item.id)}
                        >
                          <Share2 className="h-5 w-5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSave(item.id)}
                        className={`transition-colors ${savedMap[item.id] ? "text-[#F59E0B]" : "text-gray-600 hover:text-[#F59E0B]"}`}
                      >
                        <span className="sr-only">Salvar</span>
                        <Bookmark className={`h-5 w-5 ${savedMap[item.id] ? "fill-current" : ""}`} />
                      </button>
                    </div>
                  </div>

                  <CardInlineComments
                    contentItemId={item.id}
                    initialComments={initialCommentPreviews[item.id] ?? []}
                    initialCommentCount={c.comments}
                    viewerUserId={viewerUserId}
                    onCountChange={(count) => updateCommentCount(item.id, count)}
                  />

                  <div className="px-4 pb-4">
                    <Button
                      className="w-full bg-[#1D4ED8] hover:bg-[#1E3A8A]"
                      onClick={() => router.push(`/conteudo/${item.id}`)}
                    >
                      {isAssessment
                        ? "Fazer avaliacao"
                        : isExercise
                          ? "Praticar agora"
                          : isDica
                            ? "Ver dica"
                            : "Ler agora"}
                    </Button>
                  </div>
                </div>
              )
            })}

            {initialArticles.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-medium text-gray-900 mb-1">Nenhum conteudo ainda</h3>
                <p className="text-sm text-gray-500">
                  Explore professores e siga conteudos para preencher seu feed.
                </p>
              </div>
            )}

          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Sequencia de estudos</span>
              <Flame className="h-6 w-6" />
            </div>
            <div className="text-4xl font-bold font-display">
              {streakDays} {streakDays === 1 ? "dia" : "dias"}
            </div>
            <p className="text-sm text-orange-100 mt-1">
              {streakDays > 0 ? "Continue assim! Voce esta indo muito bem." : "Comece hoje e inicie sua sequencia!"}
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-gray-900">Plano de Hoje</h3>
              <Link href="/dashboard/aluno/plano" className="text-sm text-[#10B981] hover:underline flex items-center gap-1">
                Ver tudo <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {todayItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-2">
                  Nenhuma tarefa para hoje.{" "}
                  <Link href="/dashboard/aluno/plano" className="text-[#10B981] underline">
                    Adicione no plano
                  </Link>
                </p>
              ) : (
                todayItems.map((task) => (
                  <div key={task.id} className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${task.isDone ? "bg-green-100" : "bg-gray-100"}`}>
                      {task.isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                      ) : (
                        <Clock className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${task.isDone ? "line-through text-gray-400" : "text-gray-900"}`}>
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {task.kind === "classroom" ? "Sala de aula" : "Tarefa pessoal"}
                      </div>
                    </div>
                    {task.href && !task.isDone && (
                      <Link href={task.href} className="text-xs text-[#1D4ED8] hover:underline flex-shrink-0">
                        Ir
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Progresso de hoje</span>
                <span className="font-medium text-[#10B981]">{todayProgress}%</span>
              </div>
              <Progress value={todayProgress} className="h-2" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <h3 className="font-display font-semibold text-gray-900 mb-4">Resumo da Semana</h3>
            {(!weekStats || (weekStats.personalTotal === 0 && weekStats.classroomActivitiesInWeek === 0)) ? (
              <p className="text-sm text-gray-500 text-center py-2">Nenhuma atividade esta semana ainda.</p>
            ) : (
              <div className="space-y-4">
                {weekStats.personalTotal > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">Tarefas pessoais</span>
                      <span className="font-medium text-gray-900">{weekStats.personalDone}/{weekStats.personalTotal}</span>
                    </div>
                    <Progress value={Math.round((weekStats.personalDone / weekStats.personalTotal) * 100)} className="h-2" />
                  </div>
                )}
                {weekStats.classroomActivitiesInWeek > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">Atividades de sala</span>
                      <span className="font-medium text-gray-900">{weekStats.classroomSubmitted}/{weekStats.classroomActivitiesInWeek}</span>
                    </div>
                    <Progress value={Math.round((weekStats.classroomSubmitted / weekStats.classroomActivitiesInWeek) * 100)} className="h-2" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
