import { requireAlunoAccess } from "@/lib/auth/guards"
import { AlunoLayoutClient } from "./_layout-client"

export default async function AlunoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Barreira de segurança real: consulta o banco, não o JWT.
  // Redireciona para /dashboard/professor se user_type !== 'aluno'.
  await requireAlunoAccess()

  return <AlunoLayoutClient>{children}</AlunoLayoutClient>
}
