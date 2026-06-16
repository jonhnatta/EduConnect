import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { queryOne } from "@/lib/db/query"

export const runtime = "nodejs"

type ProfileRow = {
  full_name: string | null
  avatar_url: string | null
  user_type: string | null
  professor_verification_status: string | null
  professor_verification_ai_reason: string | null
  cover_url: string | null
  profile_visibility: "public" | "private"
}

export async function GET() {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) {
    return NextResponse.json({ ok: true, user: null, profile: null })
  }

  const profile = await queryOne<ProfileRow>(
    `select full_name, avatar_url, cover_url, user_type, professor_verification_status,
            professor_verification_ai_reason,
            coalesce(profile_visibility, 'private') as profile_visibility
       from public.profiles
      where id = $1`,
    [userId]
  )

  return NextResponse.json({
    ok: true,
    user: { id: userId, email: session?.user?.email ?? null },
    profile,
  })
}
