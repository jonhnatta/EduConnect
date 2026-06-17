import type { PoolClient, QueryResultRow } from "pg"
import { queryOne } from "@/lib/db/query"

export type UserType = "aluno" | "professor"
export type ProfessorVerificationStatus = "none" | "pending" | "approved" | "rejected"

export type ProfileAccessRow = QueryResultRow & {
  user_type: UserType | null
  professor_verification_status: ProfessorVerificationStatus | null
  deleted_at: string | null
}

export async function getProfileAccess(userId: string) {
  return queryOne<ProfileAccessRow>(
    "select user_type, professor_verification_status, deleted_at from public.profiles where id = $1",
    [userId],
  )
}

export function isApprovedProfessor(profile: ProfileAccessRow | null | undefined) {
  return (
    profile?.user_type === "professor" &&
    profile.professor_verification_status === "approved"
  )
}

export async function upsertProfile(
  client: PoolClient,
  input: {
    id: string
    fullName?: string | null
    userType?: UserType | null
    avatarUrl?: string | null
  },
) {
  await client.query(
    `insert into public.profiles (id, full_name, user_type, avatar_url)
     values ($1, $2, $3, $4)
     on conflict (id) do update set
       full_name = coalesce(public.profiles.full_name, excluded.full_name),
       user_type = coalesce(excluded.user_type, public.profiles.user_type),
       avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url)`,
    [
      input.id,
      input.fullName ?? null,
      input.userType ?? null,
      input.avatarUrl ?? null,
    ],
  )
}
