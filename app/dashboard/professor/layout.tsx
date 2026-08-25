import { requireProfessorAccess } from "@/lib/auth/guards"
import { getMyUnreadCount } from "@/app/actions/notifications"
import { ProfessorLayoutClient } from "./_layout-client"
import { getDefaultCopilotAccess } from "@/lib/ai/copilot/runtime"

export default async function ProfessorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await requireProfessorAccess()
  const [unreadCount, copilotAccess] = await Promise.all([
    getMyUnreadCount().catch(() => 0),
    getDefaultCopilotAccess(userId).catch(() => ({ ok: false as const })),
  ])

  return (
    <ProfessorLayoutClient
      unreadNotifications={unreadCount}
      copilotAvailable={copilotAccess.ok}
    >
      {children}
    </ProfessorLayoutClient>
  )
}
