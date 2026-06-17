import { requireProfessorAccess } from "@/lib/auth/guards"
import { getMyUnreadCount } from "@/app/actions/notifications"
import { ProfessorLayoutClient } from "./_layout-client"

export default async function ProfessorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireProfessorAccess()
  const unreadCount = await getMyUnreadCount().catch(() => 0)

  return <ProfessorLayoutClient unreadNotifications={unreadCount}>{children}</ProfessorLayoutClient>
}
