"use client"

import {
  deleteContentItem,
  recordContentShare,
  toggleContentLike,
  toggleContentSave,
  type ProfessorContentListItem,
} from "@/app/actions/content-items"
import { ContentExerciseSubmissionsDialog } from "@/components/dashboard/content-exercise-submissions-dialog"
import { ArticleCoverMedia } from "@/components/dashboard/article-cover-media"
import { CardInlineComments } from "@/components/dashboard/card-inline-comments"
import type { ContentComment } from "@/app/actions/content-items"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Clock,
  Heart,
  ClipboardList,
  Lightbulb,
  Loader2,
  MessageCircle,
  Pencil,
  Share2,
  Sparkles,
  Star,
  Trash2,
  XCircle,
} from "lucide-react"
import { ContentReviewDialog } from "@/components/dashboard/content-review-dialog"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

const FEED_CATEGORIAS: { key: string; label: string; types?: string[] }[] = [
  { key: "todos", label: "Todos" },
  { key: "artigos", label: "Artigos", types: ["article"] },
  { key: "exercicios", label: "Exercícios", types: ["exercise"] },
  { key: "provas", label: "Provas", types: ["assessment", "simulado"] },
  { key: "dicas", label: "Dicas", types: ["dica"] },
]

type Props = {
  authorName: string | null
  authorAvatarUrl: string | null
  initialItems: ProfessorContentListItem[]
  initialCommentPreviews?: Record<string, ContentComment[]>
  viewerUserId?: string | null
}

function initials(name: string | null): string {
  if (!name?.trim()) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return parts[0].slice(0, 2).toUpperCase()
}

export function ProfessorContentFeed({
  authorName,
  authorAvatarUrl,
  initialItems,
  initialCommentPreviews = {},
  viewerUserId = null,
}: Props) {
  const router = useRouter()
  const items = useMemo(() => initialItems ?? [], [initialItems])
  const [categoria, setCategoria] = useState<string>("todos")
  const visibleItems = useMemo(() => {
    if (categoria === "todos") return items
    const types = FEED_CATEGORIAS.find((c) => c.key === categoria)?.types ?? []
    return items.filter((i) => types.includes(i.type))
  }, [items, categoria])
  const [savedItems, setSavedItems] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [submissionsDialog, setSubmissionsDialog] = useState<{
    id: string
    title: string
  } | null>(null)
  const [reviewDialog, setReviewDialog] = useState<{
    id: string
    status: "revisao" | "aguardando_decisao"
  } | null>(null)
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [counts, setCounts] = useState<Record<string, { likes: number; shares: number; comments: number }>>(() => {
    const o: Record<string, { likes: number; shares: number; comments: number }> = {}
    for (const a of items) {
      o[a.id] = { likes: a.like_count, shares: a.share_count, comments: a.comment_count }
    }
    return o
  })

  const toggleSave = async (id: string) => {
    const wasSaved = savedItems.includes(id)
    // otimista
    setSavedItems((prev) => (wasSaved ? prev.filter((i) => i !== id) : [...prev, id]))
    const res = await toggleContentSave(id)
    if (!res.ok) {
      // reverte em caso de erro
      setSavedItems((prev) => (wasSaved ? [...prev, id] : prev.filter((i) => i !== id)))
      toast.error(res.error)
    }
  }

  const updateCommentCount = (id: string, count: number) => {
    setCounts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { likes: 0, shares: 0, comments: 0 }), comments: count },
    }))
  }

  const onLike = async (articleId: string) => {
    const res = await toggleContentLike(articleId)
    if (!res.ok) {
      toast.error(res.error)
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

  async function handleDelete(id: string) {
    setDeletingId(id)
    const res = await deleteContentItem(id)
    setDeletingId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Conteudo excluido")
    router.refresh()
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {FEED_CATEGORIAS.map((c) => (
          <Button
            key={c.key}
            size="sm"
            variant={categoria === c.key ? "default" : "outline"}
            className={categoria === c.key ? "bg-[#1D4ED8] hover:bg-[#1E3A8A]" : ""}
            onClick={() => setCategoria(c.key)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-900 font-medium mb-1">Nenhum conteudo ainda</p>
            <p className="text-sm text-gray-500 mb-6">
              Quando publicar, seus posts aparecem aqui no mesmo formato do feed dos alunos.
            </p>
            <Button asChild className="bg-[#1D4ED8] hover:bg-[#1E3A8A]">
              <Link href="/dashboard/professor/criar">Criar conteúdo</Link>
            </Button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500">
            Nenhum conteúdo nesta categoria.
          </div>
        ) : (
          visibleItems.map((item) => {
            const c = counts[item.id] ?? { likes: item.like_count, shares: item.share_count, comments: item.comment_count }
            const liked = !!likedMap[item.id]
            const isExercise = item.type === "exercise"
            const isAssessment = item.type === "assessment"
            const isSimulado = item.type === "simulado"
            const isDica = item.type === "dica"
            const isExamLike = isExercise || isAssessment || isSimulado
            const disciplina =
              item.disciplina?.trim() ||
              (isSimulado
                ? "Simulado"
                : isAssessment
                  ? "Avaliacao"
                  : isExercise
                    ? "Exercicio"
                    : isDica
                      ? "Dica rapida"
                      : "Artigo")
            const cover = item.coverUrl?.trim() || null
            const coverVideo = isExamLike ? null : item.coverVideoUrl?.trim() || null
            const sparklesText =
              item.status === "verificando"
                ? "Em analise pela IA — aguarde"
                : item.status === "revisao"
                  ? "Revisao necessaria — score abaixo do minimo"
                  : item.status === "aguardando_decisao"
                    ? "Aguarda sua decisao"
                    : item.status === "published"
                      ? isSimulado
                        ? "Simulado publicado na plataforma"
                        : isAssessment
                          ? "Avaliacao publicada na plataforma"
                          : isExercise
                            ? "Exercicio publicado na plataforma"
                            : isDica
                              ? "Dica publicada na plataforma"
                              : "Artigo publicado na plataforma"
                      : "Rascunho — visivel so para voce"

            const sparklesColor =
              item.status === "verificando"
                ? "text-blue-500"
                : item.status === "revisao"
                  ? "text-red-500"
                  : item.status === "aguardando_decisao"
                    ? "text-amber-500"
                    : "text-[#10B981]"

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-100 overflow-hidden"
              >
                <div className="p-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 shrink-0">
                      {authorAvatarUrl ? <AvatarImage src={authorAvatarUrl} alt="" /> : null}
                      <AvatarFallback className="bg-[#1D4ED8] text-white text-sm">
                        {initials(authorName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-medium text-gray-900">{authorName ?? "Voce"}</span>
                        <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" aria-hidden />
                        <Badge variant="secondary" className="text-xs">
                          {disciplina}
                        </Badge>
                        {isExercise ? (
                          <Badge variant="outline" className="text-xs">
                            Lista de questoes
                          </Badge>
                        ) : null}
                        {isAssessment || isSimulado ? (
                          <Badge variant="outline" className="text-xs">
                            {isSimulado ? "Multidisciplinar" : "Prova com prazo"}
                          </Badge>
                        ) : null}
                        {isDica ? (
                          <Badge variant="outline" className="text-xs">
                            Dica rapida
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {isExamLike ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-[#1D4ED8]"
                        title="Entregas"
                        type="button"
                        onClick={() =>
                          setSubmissionsDialog({ id: item.id, title: item.title })
                        }
                      >
                        <ClipboardList className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#1D4ED8]" asChild>
                      <Link href={`/dashboard/professor/criar?edit=${item.id}`} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Excluir"
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir este conteúdo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Curtidas, partilhas e dados ligados a
                            este artigo serão removidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => void handleDelete(item.id)}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="px-4 pb-3">
                  <h3 className="font-display font-semibold text-lg text-gray-900 mb-2">{item.title}</h3>
                  <div className={`flex items-center gap-2 text-sm mb-3 ${sparklesColor}`}>
                    {item.status === "verificando" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 shrink-0" />
                    )}
                    <span>{sparklesText}</span>
                  </div>

                  {/* Banners de revisão */}
                  {item.status === "verificando" && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      <span>A IA está analisando seu artigo, aguarde...</span>
                    </div>
                  )}
                  {item.status === "revisao" && (
                    <div className="mb-3 flex items-center justify-between gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 shrink-0" />
                        <span>Score abaixo de 50 — revisão necessária</span>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold underline underline-offset-2 shrink-0"
                        onClick={() => setReviewDialog({ id: item.id, status: "revisao" })}
                      >
                        Ver resultado
                      </button>
                    </div>
                  )}
                  {item.status === "aguardando_decisao" && (
                    <div className="mb-3 flex items-center justify-between gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Score entre 50–80 — aguarda sua decisão</span>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold underline underline-offset-2 shrink-0"
                        onClick={() => setReviewDialog({ id: item.id, status: "aguardando_decisao" })}
                      >
                        Decidir
                      </button>
                    </div>
                  )}
                  {item.status === "published" && item.reviewSeal === "excellence" && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-100">
                      <Star className="h-4 w-4 shrink-0 fill-green-500" />
                      <span>Selo de Excelência — pontuação acima de 80</span>
                    </div>
                  )}
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
                          <ClipboardList className="h-12 w-12" />
                        ) : isDica ? (
                          <Lightbulb className="h-12 w-12" />
                        ) : (
                          <BookOpen className="h-12 w-12" />
                        )}
                        <span className="text-sm flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {isExamLike
                            ? item.questionCount != null
                              ? `${item.questionCount} questoes`
                              : isAssessment
                                ? "Avaliacao"
                                : "Exercicio"
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
                      onClick={() => toggleSave(item.id)}
                      className={`transition-colors ${savedItems.includes(item.id) ? "text-[#F59E0B]" : "text-gray-600 hover:text-[#F59E0B]"}`}
                    >
                      <span className="sr-only">Salvar</span>
                      <Bookmark className={`h-5 w-5 ${savedItems.includes(item.id) ? "fill-current" : ""}`} />
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
                      ? "Abrir avaliacao"
                      : isExercise
                        ? "Abrir exercicio"
                        : "Ler agora"}
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <ContentExerciseSubmissionsDialog
        contentItemId={submissionsDialog?.id ?? null}
        title={submissionsDialog?.title ?? ""}
        open={!!submissionsDialog}
        onOpenChange={(o) => {
          if (!o) setSubmissionsDialog(null)
        }}
      />

      <ContentReviewDialog
        contentItemId={reviewDialog?.id ?? null}
        status={reviewDialog?.status ?? null}
        open={!!reviewDialog}
        onOpenChange={(o) => {
          if (!o) setReviewDialog(null)
        }}
      />
    </>
  )
}
