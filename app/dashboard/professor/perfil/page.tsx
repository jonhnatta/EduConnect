import { redirect } from "next/navigation"
import { getCurrentDashboardProfile } from "@/app/actions/profile"
import { getProfileSocialStats } from "@/app/actions/follows"
import { ProfilePageEditor } from "@/components/dashboard/profile-page-editor"

export default async function ProfessorPerfilPage() {
  const profile = await getCurrentDashboardProfile()
  if (!profile) redirect("/login")
  if (!profile.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "professor") redirect("/dashboard/aluno/perfil")

  const socialStats = await getProfileSocialStats(profile.id, "professor")

  return <ProfilePageEditor initialProfile={profile} profileType="professor" socialStats={socialStats} />
}
