import { redirect } from "next/navigation"
import { getCurrentDashboardProfile } from "@/app/actions/profile"
import { ProfilePageEditor } from "@/components/dashboard/profile-page-editor"

export default async function ProfessorPerfilPage() {
  const profile = await getCurrentDashboardProfile()
  if (!profile) redirect("/login")
  if (!profile.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "professor") redirect("/dashboard/aluno/perfil")

  return <ProfilePageEditor initialProfile={profile} profileType="professor" />
}
