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
  // bcrypt trunca em 72 bytes; rejeita entradas absurdas (anti-DoS)
  if (newPassword.length > 72) {
    return { ok: false, error: "A nova senha deve ter no maximo 72 caracteres" }
  }

  const row = await queryOne<{ password_hash: string | null }>(
    "SELECT password_hash FROM public.users WHERE id = $1",
    [user.id]
  )

  if (!row?.password_hash) {
    return { ok: false, error: "Esta conta usa login social e nao possui senha" }
  }

  // Rate limit: máx. 5 tentativas por janela de 15 min (anti brute-force da senha atual)
  const limitRow = await queryOne<{ attempt_count: number }>(
    `insert into public.password_change_limits (user_id, window_started_at, attempt_count, updated_at)
     values ($1, timezone('utc'::text, now()), 1, timezone('utc'::text, now()))
     on conflict (user_id) do update set
       updated_at = timezone('utc'::text, now()),
       window_started_at = case
         when public.password_change_limits.window_started_at <= timezone('utc'::text, now()) - interval '15 minutes'
           then timezone('utc'::text, now())
         else public.password_change_limits.window_started_at
       end,
       attempt_count = case
         when public.password_change_limits.window_started_at <= timezone('utc'::text, now()) - interval '15 minutes'
           then 1
         else public.password_change_limits.attempt_count + 1
       end
     returning attempt_count`,
    [user.id]
  )
  if ((limitRow?.attempt_count ?? 1) > 5) {
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
  }

  const valid = await bcrypt.compare(currentPassword, row.password_hash)
  if (!valid) return { ok: false, error: "Senha atual incorreta" }

  const hash = await bcrypt.hash(newPassword, 12)
  await query("UPDATE public.users SET password_hash = $1 WHERE id = $2", [hash, user.id])
  // Sucesso: zera o contador de tentativas
  await query("DELETE FROM public.password_change_limits WHERE user_id = $1", [user.id]).catch(() => {})

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
