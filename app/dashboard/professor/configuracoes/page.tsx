import { auth } from "@/auth"
import { ProfessorSettingsClient } from "@/components/dashboard/professor-settings-client"
import { queryOne } from "@/lib/db/query"

type ProfileRow = {
  full_name: string | null
  professor_verification_status: string | null
  profile_visibility: "public" | "private" | null
  notification_prefs: Record<string, boolean> | null
  has_password: boolean
}

export default async function ProfessorConfiguracoesPage() {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined

  const profile = userId
    ? await queryOne<ProfileRow>(
        `select pr.full_name, pr.professor_verification_status,
                coalesce(pr.profile_visibility, 'private') as profile_visibility,
                pr.notification_prefs,
                (u.password_hash IS NOT NULL) as has_password
           from public.profiles pr
           join public.users u on u.id = pr.id
          where pr.id = $1`,
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
      hasPassword={profile?.has_password ?? false}
    />
  )
}
