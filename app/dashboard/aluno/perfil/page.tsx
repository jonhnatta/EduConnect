import { redirect } from "next/navigation"
import { getCurrentDashboardProfile } from "@/app/actions/profile"
import { getProfileSocialStats } from "@/app/actions/follows"
import { ProfilePageEditor } from "@/components/dashboard/profile-page-editor"

export default async function AlunoPerfilPage() {
  const profile = await getCurrentDashboardProfile()
  if (!profile) redirect("/login")
  if (!profile.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "aluno") redirect("/dashboard/professor/perfil")

  const socialStats = await getProfileSocialStats(profile.id, "aluno")

  return <ProfilePageEditor initialProfile={profile} profileType="aluno" socialStats={socialStats} />
}
