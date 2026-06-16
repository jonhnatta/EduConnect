import { auth } from "@/auth"
import { ProfessorSettingsClient } from "@/components/dashboard/professor-settings-client"
import { queryOne } from "@/lib/db/query"

type ProfileRow = {
  full_name: string | null
  professor_verification_status: string | null
  profile_visibility: "public" | "private" | null
  notification_prefs: Record<string, boolean> | null
}

export default async function ProfessorConfiguracoesPage() {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined

  const profile = userId
    ? await queryOne<ProfileRow>(
        `select full_name, professor_verification_status,
                coalesce(profile_visibility, 'private') as profile_visibility,
                notification_prefs
           from public.profiles
          where id = $1`,
        [userId]
      )
    : null

  return (
    <ProfessorSettingsClient
      fullName={profile?.full_name?.trim() || "Professor"}
      email={session?.user?.email || "sem-email"}
      verificationStatus={profile?.professor_verification_status ?? null}
      profileVisibility={profile?.profile_visibility === "public" ? "public" : "private"}
      notificationPrefs={profile?.notification_prefs ?? {}}
    />
  )
}
