import { auth } from "@/auth"
import { queryOne } from "@/lib/db/query"

export type AuthedUser = { id: string; email: string | null }

export async function getAuthedUser(): Promise<AuthedUser | null> {
  const session = await auth()
  const id = (session?.user as any)?.id as string | undefined
  if (!id) return null
  const active = await queryOne<{ id: string; email: string }>(
    `select u.id, u.email
       from public.users u
       join public.profiles p on p.id = u.id
      where u.id = $1
        and p.deleted_at is null
        and p.account_status = 'active'
        and u.email_verified_at is not null`,
    [id]
  ).catch(() => null)
  if (!active) return null
  return { id: active.id, email: active.email }
}

export async function requireAuthedUser(): Promise<AuthedUser> {
  const user = await getAuthedUser()
  if (!user) throw new Error("Nao autenticado")
  return user
}
