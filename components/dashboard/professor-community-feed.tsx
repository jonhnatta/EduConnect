"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArticleCoverMedia } from "@/components/dashboard/article-cover-media"
import {
  BookOpen,
  FileText,
  Loader2,
  Users,
  UserPlus,
  UserCheck,
  Rss,
} from "lucide-react"
import { toggleProfessorFollow } from "@/app/actions/follows"
import {
  getProfessorCommunityFeedPage,
  type CommunityFeedItem,
  type CommunityFeedPage,
} from "@/app/actions/content-items"

const TYPE_LABEL: Record<string, string> = {
  article: "Artigo",
  exercise: "Exercicio",
  assessment: "Avaliacao",
  simulado: "Simulado",
  dica: "Dica",
}

type FeedStatus = "idle" | "loading" | "error" | "end"
type FeedRequest = { cursor: string | null; replace: boolean }

function initials(name: string | null) {
  if (!name) return "P"
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "P"
}

function initialFollowing(items: CommunityFeedItem[]) {
  return Object.fromEntries(items.map((item) => [item.author_id, item.is_following]))
}

export function ProfessorCommunityFeed({ initialPage }: { initialPage: CommunityFeedPage }) {
  const initialStatus: FeedStatus = !initialPage.ok
    ? "error"
    : initialPage.nextCursor
      ? "idle"
      : "end"
  const [items, setItems] = useState(initialPage.items)
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor)
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(initialStatus)
  const [feedError, setFeedError] = useState<string | null>(
    initialPage.ok ? null : initialPage.error ?? "Nao foi possivel carregar o feed"
  )
  const [following, setFollowing] = useState<Record<string, boolean>>(() =>
    initialFollowing(initialPage.items)
  )
  const [pendingId, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef(true)
  const inFlightRef = useRef(false)
  const queuedRefreshRef = useRef<FeedRequest | null>(null)
  const nextCursorRef = useRef(initialPage.nextCursor)
  const failedRequestRef = useRef<FeedRequest | null>(
    initialPage.ok ? null : { cursor: null, replace: true }
  )
  const statusRef = useRef<FeedStatus>(initialStatus)

  const setStatus = useCallback((status: FeedStatus) => {
    statusRef.current = status
    setFeedStatus(status)
  }, [])

  const loadPage = useCallback(
    async (initialRequest: FeedRequest) => {
      if (inFlightRef.current) {
        if (initialRequest.replace) queuedRefreshRef.current = initialRequest
        return
      }
      inFlightRef.current = true
      try {
        let request: FeedRequest | null = initialRequest
        while (request && mountedRef.current) {
          setFeedError(null)
          setStatus("loading")

          let page: CommunityFeedPage
          try {
            page = await getProfessorCommunityFeedPage({ cursor: request.cursor })
          } catch {
            page = {
              ok: false,
              items: [],
              nextCursor: null,
              error: "Nao foi possivel carregar o feed agora",
            }
          }
          if (!mountedRef.current) break

          if (!page.ok) {
            failedRequestRef.current = page.resetRequired
              ? { cursor: null, replace: true }
              : request
            setFeedError(page.error ?? "Nao foi possivel carregar o feed")
            setStatus("error")
          } else if (request.cursor && page.nextCursor === request.cursor) {
            failedRequestRef.current = { cursor: null, replace: true }
            setFeedError("O feed nao conseguiu avancar. Recarregue a lista.")
            setStatus("error")
          } else {
            const replace = request.replace
            setItems((current) => {
              if (replace) return page.items
              const seen = new Set(current.map((item) => item.id))
              const incoming = page.items.filter((item) => {
                if (seen.has(item.id)) return false
                seen.add(item.id)
                return true
              })
              return [...current, ...incoming]
            })
            setFollowing((current) => {
              if (replace) return initialFollowing(page.items)
              const next = { ...current }
              for (const item of page.items) {
                if (!Object.prototype.hasOwnProperty.call(next, item.author_id)) {
                  next[item.author_id] = item.is_following
                }
              }
              return next
            })
            failedRequestRef.current = null
            nextCursorRef.current = page.nextCursor
            setNextCursor(page.nextCursor)
            setStatus(page.nextCursor ? "idle" : "end")
          }

          request = queuedRefreshRef.current
          queuedRefreshRef.current = null
        }
      } finally {
        inFlightRef.current = false
      }
    },
    [setStatus]
  )

  const loadMore = useCallback(() => {
    if (statusRef.current !== "idle" || !nextCursorRef.current) return
    void loadPage({ cursor: nextCursorRef.current, replace: false })
  }, [loadPage])

  const retry = useCallback(() => {
    if (failedRequestRef.current) void loadPage(failedRequestRef.current)
  }, [loadPage])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      queuedRefreshRef.current = null
    }
  }, [])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (
      feedStatus !== "idle" ||
      !nextCursor ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    ) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { root: null, rootMargin: "500px 0px", threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [feedStatus, loadMore, nextCursor])

  function handleFollow(authorId: string) {
    const prev = following[authorId] ?? false
    setFollowing((state) => ({ ...state, [authorId]: !prev }))
    startTransition(async () => {
      try {
        const res = await toggleProfessorFollow(authorId)
        if (!res.ok) {
          setFollowing((state) => ({ ...state, [authorId]: prev }))
          toast.error(res.error)
          return
        }
        setFollowing((state) => ({ ...state, [authorId]: res.following }))
        toast.success(res.following ? "Seguindo!" : "Deixou de seguir")
        // O follow faz o post mudar de bucket; reinicia o cursor para não pular
        // nem repetir publicações com a ordenação antiga.
        void loadPage({ cursor: null, replace: true })
      } catch {
        setFollowing((state) => ({ ...state, [authorId]: prev }))
        toast.error("Nao foi possivel atualizar quem voce segue")
      }
    })
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && feedStatus !== "loading" && feedStatus !== "error" ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Rss className="mx-auto mb-4 h-12 w-12 text-gray-200" />
          <p className="font-medium text-gray-900">Nenhuma publicacao na comunidade ainda</p>
          <p className="mt-1 text-sm text-gray-500">
            Quando outros professores publicarem conteudo publico, voce vera por aqui.
          </p>
        </div>
      ) : null}

      {items.map((item) => {
        const isFollowing = following[item.author_id] ?? false
        return (
          <article
            key={item.id}
            className="rounded-xl border border-gray-100 bg-white p-5"
            style={{ contentVisibility: "auto", containIntrinsicSize: "460px" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={item.author.avatar_url || ""} />
                  <AvatarFallback className="bg-[#1D4ED8] text-white text-sm">
                    {initials(item.author.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  {item.author_slug ? (
                    <Link
                      href={`/professor/${item.author_slug}`}
                      className="font-medium text-gray-900 hover:underline truncate block"
                    >
                      {item.author.full_name ?? "Professor"}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900 truncate block">
                      {item.author.full_name ?? "Professor"}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {item.published_at ? new Date(item.published_at).toLocaleDateString("pt-BR") : ""}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isFollowing ? "outline" : "default"}
                className={isFollowing ? "border-gray-200 gap-1.5" : "bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-1.5"}
                disabled={pendingId}
                onClick={() => handleFollow(item.author_id)}
              >
                {isFollowing ? (
                  <><UserCheck className="h-4 w-4" /> Seguindo</>
                ) : (
                  <><UserPlus className="h-4 w-4" /> Seguir</>
                )}
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-50 text-[#1D4ED8] gap-1">
                {item.type === "article" ? <FileText className="h-3 w-3" /> : item.type === "dica" ? <BookOpen className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {TYPE_LABEL[item.type] ?? item.type}
              </Badge>
              {item.audience === "teachers" ? (
                <Badge className="bg-violet-50 text-violet-700">So professores</Badge>
              ) : null}
            </div>

            <h3 className="mt-2 font-display text-lg font-semibold text-gray-900">{item.title}</h3>
            {item.excerpt ? (
              <p className="mt-1 text-sm text-gray-600 line-clamp-3">{item.excerpt}</p>
            ) : null}
            {item.image_url || item.video_url ? (
              <div className="mt-3 rounded-lg overflow-hidden border border-gray-100 max-h-64">
                <ArticleCoverMedia
                  imageUrl={item.image_url}
                  videoUrl={item.video_url}
                  className="w-full max-h-64 object-cover"
                  deferLoading
                />
              </div>
            ) : null}

            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link href={`/conteudo/${item.id}`}>Ver publicacao</Link>
              </Button>
            </div>
          </article>
        )
      })}

      <div ref={sentinelRef} className="h-px" aria-hidden="true" />
      <div className="min-h-10 text-center" aria-live="polite">
        {feedStatus === "loading" ? (
          <div className="inline-flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando mais publicacoes...
          </div>
        ) : null}
        {feedStatus === "error" ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm text-red-700">{feedError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>
              Tentar novamente
            </Button>
          </div>
        ) : null}
        {feedStatus === "idle" && nextCursor ? (
          <Button type="button" variant="ghost" size="sm" onClick={loadMore}>
            Carregar mais
          </Button>
        ) : null}
        {feedStatus === "end" && items.length > 0 ? (
          <p className="text-sm text-gray-400">Voce chegou ao fim.</p>
        ) : null}
      </div>
    </div>
  )
}
