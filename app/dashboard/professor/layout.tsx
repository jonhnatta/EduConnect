import { requireProfessorAccess } from "@/lib/auth/guards"
import { ProfessorLayoutClient } from "./_layout-client"

export default async function ProfessorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Barreira de segurança real: consulta o banco, não o JWT.
  // Redireciona para /dashboard/aluno se user_type !== 'professor'.
  await requireProfessorAccess()

  return <ProfessorLayoutClient>{children}</ProfessorLayoutClient>
}
