import { requireAlunoAccess } from "@/lib/auth/guards"
import { getMyUnreadCount } from "@/app/actions/notifications"
import { AlunoLayoutClient } from "./_layout-client"

export default async function AlunoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAlunoAccess()
  const unreadCount = await getMyUnreadCount().catch(() => 0)

  return <AlunoLayoutClient unreadNotifications={unreadCount}>{children}</AlunoLayoutClient>
}
