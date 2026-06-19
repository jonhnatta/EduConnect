"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bell, BookOpen, Users, CheckCheck, FileCheck, Inbox, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getMyNotifications,
  markNotificationRead,
  type Notification,
} from "@/app/actions/notifications"

type Accent = "green" | "blue"

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  new_content: { icon: <BookOpen className="h-5 w-5" />, color: "bg-emerald-50 text-emerald-600" },
  new_follower: { icon: <Users className="h-5 w-5" />, color: "bg-blue-50 text-blue-600" },
  activity_graded: { icon: <CheckCheck className="h-5 w-5" />, color: "bg-amber-50 text-amber-600" },
  review_result: { icon: <FileCheck className="h-5 w-5" />, color: "bg-violet-50 text-violet-600" },
  submission_received: { icon: <Inbox className="h-5 w-5" />, color: "bg-blue-50 text-blue-600" },
}

const PAGE_SIZE = 20

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Agora"
  if (mins < 60) return `Ha ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Ha ${hrs} h`
  const days = Math.floor(hrs / 24)
  return `Ha ${days} dia${days !== 1 ? "s" : ""}`
}

function entityHref(n: Notification): string | null {
  if (n.entity_type === "content_item" && n.entity_id) return `/conteudo/${n.entity_id}`
  return null
}

export function NotificationsList({
  initial,
  initialHasMore,
  accent = "green",
}: {
  initial: Notification[]
  initialHasMore: boolean
  accent?: Accent
}) {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>(initial)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, startLoadMore] = useTransition()
  const [marking, startMarking] = useTransition()

  const unreadBadge =
    accent === "blue" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
  const unreadCard =
    accent === "blue" ? "border-blue-100 bg-blue-50/40" : "border-emerald-100 bg-emerald-50/40"

  function handleClick(n: Notification) {
    const href = entityHref(n)
    if (!n.read_at) {
      // Otimista: marca como lida localmente
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      startMarking(async () => {
        await markNotificationRead(n.id)
        router.refresh()
        if (href) router.push(href)
      })
    } else if (href) {
      router.push(href)
    }
  }

  function handleLoadMore() {
    startLoadMore(async () => {
      const res = await getMyNotifications(PAGE_SIZE, items.length)
      setItems((prev) => [...prev, ...res.notifications])
      setHasMore(res.hasMore)
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
        <Bell className="mx-auto mb-4 h-12 w-12 text-gray-200" />
        <p className="font-medium text-gray-900">Nenhuma notificacao ainda</p>
        <p className="mt-1 text-sm text-gray-500">Suas atualizacoes aparecerao aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((n) => {
        const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.new_content
        const href = entityHref(n)
        const clickable = href != null || !n.read_at
        return (
          <div
            key={n.id}
            onClick={() => clickable && handleClick(n)}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault()
                handleClick(n)
              }
            }}
            className={`rounded-xl border p-4 transition-colors ${
              n.read_at ? "border-gray-100 bg-white" : unreadCard
            } ${clickable ? "cursor-pointer hover:border-gray-300" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.color}`}>
                {cfg.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-gray-900">{n.message}</p>
                  {!n.read_at && <Badge className={`shrink-0 ${unreadBadge}`}>Novo</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-gray-400">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          </div>
        )
      })}

      {hasMore && (
        <Button
          variant="outline"
          className="w-full"
          onClick={handleLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Carregar mais
        </Button>
      )}
      {!hasMore && items.length > PAGE_SIZE && (
        <p className="py-2 text-center text-xs text-gray-400">Voce chegou ao fim.</p>
      )}
    </div>
  )
}
