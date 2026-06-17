"use server"

import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { query, queryOne } from "@/lib/db/query"
import { requireAuthedUser } from "@/lib/auth/user"
import { signOut } from "@/auth"

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "A nova senha deve ter ao menos 8 caracteres" }
  }

  const row = await queryOne<{ password_hash: string | null }>(
    "SELECT password_hash FROM public.users WHERE id = $1",
    [user.id]
  )

  if (!row?.password_hash) {
    return { ok: false, error: "Esta conta usa login social e nao possui senha" }
  }

  const valid = await bcrypt.compare(currentPassword, row.password_hash)
  if (!valid) return { ok: false, error: "Senha atual incorreta" }

  const hash = await bcrypt.hash(newPassword, 12)
  await query("UPDATE public.users SET password_hash = $1 WHERE id = $2", [hash, user.id])

  return { ok: true }
}

export async function deleteAccount(
  confirmation: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const row = await queryOne<{ password_hash: string | null; deleted_at: string | null; email: string }>(
    `SELECT u.password_hash, pr.deleted_at, u.email
       FROM public.profiles pr
       JOIN public.users u ON u.id = pr.id
      WHERE pr.id = $1`,
    [user.id]
  )

  if (row?.deleted_at) return { ok: false, error: "Conta ja marcada para exclusao" }

  if (row?.password_hash) {
    // Conta com senha: verificar bcrypt
    const valid = await bcrypt.compare(confirmation, row.password_hash)
    if (!valid) return { ok: false, error: "Senha incorreta" }
  } else {
    // Conta OAuth (sem senha): exigir confirmação por e-mail
    if (!row?.email || confirmation.toLowerCase().trim() !== row.email.toLowerCase().trim()) {
      return { ok: false, error: "E-mail incorreto. Digite seu e-mail para confirmar." }
    }
  }

  await query(
    "UPDATE public.profiles SET deleted_at = now() WHERE id = $1",
    [user.id]
  )

  await signOut({ redirect: false })
  return { ok: true }
}
