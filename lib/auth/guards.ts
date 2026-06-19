import { redirect } from "next/navigation"
import { getAuthedUser } from "./user"
import { getProfileAccess, isApprovedProfessor } from "./profile"
import type { ProfileAccessRow } from "./profile"

export type GuardedAccess = {
  userId: string
  profile: ProfileAccessRow
}

export type ActionGuardedAccess =
  | { ok: true; userId: string; profile: ProfileAccessRow }
  | { ok: false; error: string }

/**
 * Garante que o usuário autenticado é professor (qualquer status de verificação).
 * Consulta o banco diretamente — não confia no claim do JWT.
 */
export async function requireProfessorAccess(): Promise<GuardedAccess> {
  const user = await getAuthedUser()
  if (!user) redirect("/login")

  const profile = await getProfileAccess(user.id)
  if (profile?.deleted_at) redirect("/login?error=AccountDeleted")
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
  if (profile?.deleted_at) redirect("/login?error=AccountDeleted")
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
  if (profile?.deleted_at) redirect("/login?error=AccountDeleted")
  if (!profile?.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "aluno") redirect("/dashboard/professor")

  return { userId: user.id, profile }
}

export async function getProfessorActionAccess(): Promise<ActionGuardedAccess> {
  const user = await getAuthedUser()
  if (!user) return { ok: false, error: "Nao autenticado" }

  const profile = await getProfileAccess(user.id)
  if (!profile?.user_type) return { ok: false, error: "Perfil incompleto" }
  if (profile.user_type !== "professor") return { ok: false, error: "Acesso negado" }

  return { ok: true, userId: user.id, profile }
}

export async function getApprovedProfessorActionAccess(): Promise<ActionGuardedAccess> {
  const access = await getProfessorActionAccess()
  if (!access.ok) return access
  if (!isApprovedProfessor(access.profile)) {
    return { ok: false, error: "Apenas professores aprovados" }
  }
  return access
}
