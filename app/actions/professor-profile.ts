"use server"

import { requireAuthedUser } from "@/lib/auth/user"
import { query, queryOne } from "@/lib/db/query"

export type ProfessorPublicProfile = {
  id: string
  slug: string | null
  fullName: string | null
  avatarUrl: string | null
  coverUrl: string | null
  headline: string | null
  bio: string | null
  location: string | null
  websiteUrl: string | null
  subjects: string[]
  educationLevels: string[]
  isVerified: boolean
  publicProfileEnabled: boolean
  totalPublications: number
}

type ProfileRow = {
  id: string
  slug: string | null
  full_name: string | null
  avatar_url: string | null
  cover_url: string | null
  headline: string | null
  bio: string | null
  location: string | null
  website_url: string | null
  subjects: string[] | null
  education_levels: string[] | null
  professor_verification_status: string
  public_profile_enabled: boolean
  total_publications: number
}

function mapRow(r: ProfileRow): ProfessorPublicProfile {
  return {
    id: r.id,
    slug: r.slug,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    coverUrl: r.cover_url,
    headline: r.headline,
    bio: r.bio,
    location: r.location,
    websiteUrl: r.website_url,
    subjects: r.subjects ?? [],
    educationLevels: r.education_levels ?? [],
    isVerified: r.professor_verification_status === "approved",
    publicProfileEnabled: r.public_profile_enabled,
    totalPublications: Number(r.total_publications ?? 0),
  }
}

const PROFESSOR_SELECT = `
  p.id, p.slug, p.full_name, p.avatar_url, p.cover_url,
  p.headline, p.bio, p.location, p.website_url,
  p.subjects, p.education_levels,
  p.professor_verification_status, p.public_profile_enabled,
  count(ci.id) filter (where ci.status = 'published')::int as total_publications
`

const PROFESSOR_JOIN = `
  from public.profiles p
  left join public.content_items ci on ci.author_id = p.id
`

export async function getProfessorBySlug(
  slug: string
): Promise<ProfessorPublicProfile | null> {
  if (!slug) return null
  try {
    const row = await queryOne<ProfileRow>(
      `select ${PROFESSOR_SELECT}
       ${PROFESSOR_JOIN}
       where p.slug = $1 and p.user_type = 'professor'
       group by p.id`,
      [slug]
    )
    return row ? mapRow(row) : null
  } catch {
    return null
  }
}

export async function listProfessors(filters?: {
  search?: string
  subject?: string
  educationLevel?: string
  limit?: number
}): Promise<ProfessorPublicProfile[]> {
  const { search, subject, educationLevel, limit = 20 } = filters ?? {}

  const conditions: string[] = ["p.user_type = 'professor'", "p.public_profile_enabled = true"]
  const params: unknown[] = []

  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(p.full_name ilike $${params.length} or p.headline ilike $${params.length} or p.bio ilike $${params.length})`)
  }

  if (subject) {
    params.push(subject)
    conditions.push(`$${params.length} = any(p.subjects)`)
  }

  if (educationLevel) {
    params.push(educationLevel)
    conditions.push(`$${params.length} = any(p.education_levels)`)
  }

  params.push(limit)
  const limitClause = `limit $${params.length}`

  const where = `where ${conditions.join(" and ")}`

  try {
    const rows = await query<ProfileRow>(
      `select ${PROFESSOR_SELECT}
       ${PROFESSOR_JOIN}
       ${where}
       group by p.id
       order by count(ci.id) filter (where ci.status = 'published') desc, p.created_at asc
       ${limitClause}`,
      params
    )
    return (rows ?? []).map(mapRow)
  } catch {
    return []
  }
}

export type UpdateProfessorProfileInput = {
  slug?: string
  headline?: string
  location?: string
  websiteUrl?: string
  subjects?: string[]
  educationLevels?: string[]
  publicProfileEnabled?: boolean
}

export async function updateMyProfessorProfile(
  input: UpdateProfessorProfileInput
): Promise<{ ok: boolean; error: string | null }> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const patches: string[] = []
  const params: unknown[] = []

  function add(col: string, val: unknown) {
    params.push(val)
    patches.push(`${col} = $${params.length}`)
  }

  if (input.slug !== undefined) {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    if (!slug) return { ok: false, error: "Slug invalido" }
    add("slug", slug)
  }
  if (input.headline !== undefined) add("headline", input.headline.trim() || null)
  if (input.location !== undefined) add("location", input.location.trim() || null)
  if (input.websiteUrl !== undefined) add("website_url", input.websiteUrl.trim() || null)
  if (input.subjects !== undefined) add("subjects", input.subjects)
  if (input.educationLevels !== undefined) add("education_levels", input.educationLevels)
  if (input.publicProfileEnabled !== undefined) add("public_profile_enabled", input.publicProfileEnabled)

  if (patches.length === 0) return { ok: true, error: null }

  params.push(user.id)
  const where = `where id = $${params.length} and user_type = 'professor'`

  try {
    await queryOne<{ id: string }>(
      `update public.profiles set ${patches.join(", ")}, updated_at = now() ${where} returning id`,
      params
    )
    return { ok: true, error: null }
  } catch (e: any) {
    if (e?.code === "23505") return { ok: false, error: "Este slug ja esta em uso" }
    return { ok: false, error: e?.message ?? "Erro ao atualizar perfil" }
  }
}
