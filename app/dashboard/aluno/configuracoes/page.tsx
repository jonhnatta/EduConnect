import { auth } from "@/auth"
import { AlunoSettingsClient } from "@/components/dashboard/aluno-settings-client"
import { queryOne } from "@/lib/db/query"

type ProfileRow = {
  full_name: string | null
  profile_visibility: "public" | "private" | null
  notification_prefs: Record<string, boolean> | null
}

export default async function AlunoConfiguracoesPage() {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined

  const profile = userId
    ? await queryOne<ProfileRow>(
        "select full_name, coalesce(profile_visibility, 'private') as profile_visibility, notification_prefs from public.profiles where id = $1",
        [userId]
      )
    : null

  return (
    <AlunoSettingsClient
      fullName={profile?.full_name?.trim() || "Aluno"}
      email={session?.user?.email || "sem-email"}
      profileVisibility={profile?.profile_visibility === "public" ? "public" : "private"}
      notificationPrefs={profile?.notification_prefs ?? {}}
    />
  )
}
