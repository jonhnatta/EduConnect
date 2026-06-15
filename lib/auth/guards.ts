import { redirect } from "next/navigation"
import { getAuthedUser } from "./user"
import { getProfileAccess, isApprovedProfessor } from "./profile"
import type { ProfileAccessRow } from "./profile"

export type GuardedAccess = {
  userId: string
  profile: ProfileAccessRow
}

/**
 * Garante que o usuário autenticado é professor (qualquer status de verificação).
 * Consulta o banco diretamente — não confia no claim do JWT.
 */
export async function requireProfessorAccess(): Promise<GuardedAccess> {
  const user = await getAuthedUser()
  if (!user) redirect("/login")

  const profile = await getProfileAccess(user.id)
  if (!profile?.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "professor") redirect("/dashboard/aluno")

  return { userId: user.id, profile }
}

/**
 * Garante que o usuário autenticado é professor APROVADO.
 * Consulta o banco diretamente — não confia no claim do JWT.
 */
export async function requireApprovedProfessorAccess(): Promise<GuardedAccess> {
  const user = await getAuthedUser()
  if (!user) redirect("/login")

  const profile = await getProfileAccess(user.id)
  if (!profile?.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "professor") redirect("/dashboard/aluno")
  if (!isApprovedProfessor(profile)) redirect("/dashboard/professor?status=pendente")

  return { userId: user.id, profile }
}

/**
 * Garante que o usuário autenticado é aluno.
 * Consulta o banco diretamente — não confia no claim do JWT.
 */
export async function requireAlunoAccess(): Promise<GuardedAccess> {
  const user = await getAuthedUser()
  if (!user) redirect("/login")

  const profile = await getProfileAccess(user.id)
  if (!profile?.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "aluno") redirect("/dashboard/professor")

  return { userId: user.id, profile }
}
