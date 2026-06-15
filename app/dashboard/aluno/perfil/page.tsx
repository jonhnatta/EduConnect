import { redirect } from "next/navigation"
import { getCurrentDashboardProfile } from "@/app/actions/profile"
import { ProfilePageEditor } from "@/components/dashboard/profile-page-editor"

export default async function AlunoPerfilPage() {
  const profile = await getCurrentDashboardProfile()
  if (!profile) redirect("/login")
  if (!profile.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "aluno") redirect("/dashboard/professor/perfil")

  return <ProfilePageEditor initialProfile={profile} profileType="aluno" />
}
