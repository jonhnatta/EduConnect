"use server"

import { query, queryOne } from "@/lib/db/query"

export type ProfessorCard = {
  id: string
  slug: string
  full_name: string
  bio: string | null
  avatar_url: string | null
  interests: string[]
  post_count: number
  total_likes: number
  followers_count: number
  relevance_score: number
  em_alta: boolean
}

export type ProfessoresPage = {
  professors: ProfessorCard[]
  total: number
  hasMore: boolean
}

export type ProfessoresFilters = {
  q?: string
  disciplina?: string
  offset?: number
  limit?: number
}

const PAGE_SIZE = 18

// IDs dos top-3 globais (sem filtro) para o badge "Em Alta"
async function fetchTopIds(): Promise<Set<string>> {
  const rows = await query<{ id: string }>(
    `SELECT p.id
     FROM public.profiles p
     LEFT JOIN public.content_items ci ON ci.author_id = p.id
     WHERE p.user_type = 'professor'
       AND p.professor_verification_status = 'approved'
     GROUP BY p.id
     HAVING COUNT(DISTINCT ci.id) FILTER (WHERE ci.status = 'published') > 0
     ORDER BY (
       COUNT(DISTINCT ci.id) FILTER (WHERE ci.status = 'published') * 5
       + COALESCE(SUM(ci.like_count) FILTER (WHERE ci.status = 'published'), 0)
     ) DESC
     LIMIT 3`,
    []
  )
  return new Set((rows ?? []).map((r) => r.id))
}

export async function listProfessores(
  filters: ProfessoresFilters = {}
): Promise<ProfessoresPage> {
  const { q, disciplina, offset = 0, limit = PAGE_SIZE } = filters

  const params: unknown[] = []
  const conditions: string[] = [
    "p.user_type = 'professor'",
    "p.professor_verification_status = 'approved'",
  ]

  if (disciplina) {
    params.push(disciplina)
    // disciplina deve estar no array de interests (case-insensitive)
    conditions.push(
      `EXISTS (
         SELECT 1 FROM unnest(p.interests) AS i
         WHERE lower(i) = lower($${params.length})
       )`
    )
  }

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`)
    const idx = params.length
    conditions.push(
      `(p.full_name ILIKE $${idx}
        OR p.bio ILIKE $${idx}
        OR EXISTS (
          SELECT 1 FROM unnest(p.interests) AS i
          WHERE i ILIKE $${idx}
        ))`
    )
  }

  const where = `WHERE ${conditions.join(" AND ")}`

  // Total (para saber se há mais páginas)
  const countRow = await queryOne<{ total: string }>(
    `SELECT COUNT(DISTINCT p.id)::int AS total
     FROM public.profiles p
     ${where}`,
    params
  )
  const total = Number(countRow?.total ?? 0)

  // Página
  params.push(limit, offset)
  const rows = await query<{
    id: string
    slug: string | null
    full_name: string
    bio: string | null
    avatar_url: string | null
    interests: string[] | null
    followers_count: string
    post_count: string
    total_likes: string
    relevance_score: string
  }>(
    `SELECT
       p.id,
       p.slug,
       p.full_name,
       p.bio,
       p.avatar_url,
       p.interests,
       p.followers_count::int                                             AS followers_count,
       COUNT(DISTINCT ci.id)
         FILTER (WHERE ci.status = 'published')::int                     AS post_count,
       COALESCE(
         SUM(ci.like_count) FILTER (WHERE ci.status = 'published'), 0
       )::int                                                             AS total_likes,
       (
         COUNT(DISTINCT ci.id) FILTER (WHERE ci.status = 'published') * 5
         + COALESCE(SUM(ci.like_count) FILTER (WHERE ci.status = 'published'), 0)
       )::int                                                             AS relevance_score
     FROM public.profiles p
     LEFT JOIN public.content_items ci ON ci.author_id = p.id
     ${where}
     GROUP BY p.id
     ORDER BY relevance_score DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )

  const topIds = await fetchTopIds()

  const professors: ProfessorCard[] = (rows ?? []).map((r) => ({
    id: r.id,
    slug: r.slug ?? r.id,
    full_name: r.full_name,
    bio: r.bio,
    avatar_url: r.avatar_url,
    interests: r.interests ?? [],
    followers_count: Number(r.followers_count ?? 0),
    post_count: Number(r.post_count),
    total_likes: Number(r.total_likes),
    relevance_score: Number(r.relevance_score),
    em_alta: topIds.has(r.id),
  }))

  return {
    professors,
    total,
    hasMore: offset + professors.length < total,
  }
}

// Disciplinas únicas de todos os professores aprovados (para os chips de filtro)
export async function listDisciplinas(): Promise<string[]> {
  const rows = await query<{ disciplina: string }>(
    `SELECT DISTINCT unnest(p.interests) AS disciplina
     FROM public.profiles p
     WHERE p.user_type = 'professor'
       AND p.professor_verification_status = 'approved'
       AND p.interests IS NOT NULL
     ORDER BY disciplina`,
    []
  )
  return (rows ?? []).map((r) => r.disciplina)
}

// ─── Perfil completo para o Sheet ────────────────────────────────────────────

export type ProfessorPost = {
  id: string
  type: string
  title: string
  like_count: number
  view_count: number
  published_at: string | null
}

export type ProfessorProfile = {
  id: string
  slug: string
  full_name: string
  bio: string | null
  avatar_url: string | null
  cover_url: string | null
  interests: string[]
  followers_count: number
  post_count: number
  total_likes: number
  posts: ProfessorPost[]
}

export async function getProfessorProfile(
  slugOrId: string
): Promise<ProfessorProfile | null> {
  const prof = await queryOne<{
    id: string
    slug: string | null
    full_name: string
    bio: string | null
    avatar_url: string | null
    cover_url: string | null
    interests: string[] | null
    followers_count: string
  }>(
    `SELECT id, slug, full_name, bio, avatar_url, cover_url, interests, followers_count
     FROM public.profiles
     WHERE user_type = 'professor'
       AND professor_verification_status = 'approved'
       AND (lower(slug) = lower($1) OR id::text = $1)
     LIMIT 1`,
    [slugOrId]
  )

  if (!prof) return null

  const posts = await query<ProfessorPost>(
    `SELECT id, type, title, like_count, view_count, published_at
     FROM public.content_items
     WHERE author_id = $1 AND status = 'published'
     ORDER BY like_count DESC, published_at DESC
     LIMIT 10`,
    [prof.id]
  )

  const postList = posts ?? []

  return {
    id: prof.id,
    slug: prof.slug ?? prof.id,
    full_name: prof.full_name,
    bio: prof.bio,
    avatar_url: prof.avatar_url,
    cover_url: prof.cover_url,
    interests: prof.interests ?? [],
    followers_count: Number(prof.followers_count ?? 0),
    post_count: postList.length,
    total_likes: postList.reduce((s, p) => s + p.like_count, 0),
    posts: postList,
  }
}
