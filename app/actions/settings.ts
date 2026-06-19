"use server"

import { query, queryOne } from "@/lib/db/query"
import { getAuthedUser } from "@/lib/auth/user"

export type NotificationPrefs = Record<string, boolean>

export type MySettings = {
  profileVisibility: "public" | "private"
  notificationPrefs: NotificationPrefs
}

/** Lê as configurações do usuário atual (visibilidade + preferências de notificação). */
export async function getMySettings(): Promise<MySettings | null> {
  const user = await getAuthedUser()
  if (!user) return null
  const row = await queryOne<{ profile_visibility: string | null; notification_prefs: NotificationPrefs | null }>(
    "select profile_visibility, notification_prefs from public.profiles where id = $1",
    [user.id]
  )
  if (!row) return null
  return {
    profileVisibility: row.profile_visibility === "public" ? "public" : "private",
    notificationPrefs: (row.notification_prefs && typeof row.notification_prefs === "object"
      ? row.notification_prefs
      : {}) as NotificationPrefs,
  }
}

/** Persiste as configurações do usuário atual. */
export async function updateMySettings(input: {
  profileVisibility?: "public" | "private"
  notificationPrefs?: NotificationPrefs
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getAuthedUser()
  if (!user) return { ok: false, error: "Nao autenticado" }

  // Sanitiza as preferências: apenas chaves alfanuméricas simples e valores booleanos.
  const VALID_PREF_KEY = /^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/
  const prefs: NotificationPrefs = {}
  if (input.notificationPrefs && typeof input.notificationPrefs === "object") {
    for (const [k, v] of Object.entries(input.notificationPrefs)) {
      if (typeof k === "string" && VALID_PREF_KEY.test(k)) prefs[k] = Boolean(v)
    }
  }

  const visibility =
    input.profileVisibility === "public" || input.profileVisibility === "private"
      ? input.profileVisibility
      : null

  try {
    await query(
      `update public.profiles
         set profile_visibility = coalesce($2, profile_visibility),
             notification_prefs = $3::jsonb
       where id = $1`,
      [user.id, visibility, JSON.stringify(prefs)]
    )
  } catch (e: any) {
    console.error("[updateMySettings]", e)
    return { ok: false, error: "Erro ao salvar configuracoes" }
  }
  return { ok: true }
}
