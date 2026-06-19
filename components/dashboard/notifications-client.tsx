"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CheckCheck, Loader2 } from "lucide-react"
import { markAllNotificationsRead } from "@/app/actions/notifications"

export function NotificationsClient({ accent = "green" }: { accent?: "green" | "blue" }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function handleMarkAll() {
    start(async () => {
      await markAllNotificationsRead()
      toast.success("Notificacoes marcadas como lidas")
      router.refresh()
    })
  }

  const colorClass = accent === "blue"
    ? "border-blue-200 text-blue-700 hover:bg-blue-50"
    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"

  return (
    <Button variant="outline" className={`gap-2 ${colorClass}`} onClick={handleMarkAll} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
      Marcar tudo como lido
    </Button>
  )
}
