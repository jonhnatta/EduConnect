"use server"

import { revalidatePath } from "next/cache"
import { query, queryOne } from "@/lib/db/query"
import { getAuthedUser } from "@/lib/auth/user"

export type ProfessorReview = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  student_name: string | null
  student_avatar: string | null
}

export type ProfessorReviewsSummary = {
  average: number
  count: number
  reviews: ProfessorReview[]
  myReview: { rating: number; comment: string | null } | null
  canReview: boolean
}

/** Resumo de avaliações de um professor + a avaliação do visitante (se for aluno). */
export async function getProfessorReviews(teacherId: string): Promise<ProfessorReviewsSummary> {
  const user = await getAuthedUser()

  const agg = await queryOne<{ avg: string | null; cnt: string }>(
    "select avg(rating)::numeric(10,2) as avg, count(*)::int as cnt from public.professor_reviews where teacher_id = $1",
    [teacherId]
  )

  // Reviews com PII só para usuários autenticados (LGPD: não expor nomes/avatares publicamente)
  const reviews: ProfessorReview[] = user
    ? (await query<ProfessorReview>(
        `select r.id, r.rating, r.comment, r.created_at,
                p.full_name as student_name, p.avatar_url as student_avatar
           from public.professor_reviews r
           join public.profiles p on p.id = r.student_id
          where r.teacher_id = $1
          order by r.created_at desc
          limit 50`,
        [teacherId]
      )) ?? []
    : []

  let myReview: { rating: number; comment: string | null } | null = null
  let canReview = false
  if (user && user.id !== teacherId) {
    const me = await queryOne<{ user_type: string }>(
      "select user_type from public.profiles where id = $1",
      [user.id]
    )
    canReview = me?.user_type === "aluno"
    if (canReview) {
      const mine = await queryOne<{ rating: number; comment: string | null }>(
        "select rating, comment from public.professor_reviews where teacher_id = $1 and student_id = $2",
        [teacherId, user.id]
      )
      myReview = mine ?? null
    }
  }

  return {
    average: Number(agg?.avg ?? 0),
    count: Number(agg?.cnt ?? 0),
    reviews: reviews ?? [],
    myReview,
    canReview,
  }
}

/** Aluno avalia um professor (1 avaliação por par; upsert). */
export async function submitProfessorReview(
  teacherId: string,
  rating: number,
  comment: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getAuthedUser()
  if (!user) return { ok: false, error: "Faca login para avaliar" }
  if (user.id === teacherId) return { ok: false, error: "Voce nao pode avaliar a si mesmo" }

  const r = Math.round(Number(rating))
  if (!Number.isFinite(r) || r < 1 || r > 5) return { ok: false, error: "Nota invalida (1 a 5)" }
  const cleanComment = (comment ?? "").trim().slice(0, 1000) || null

  const me = await queryOne<{ user_type: string }>(
    "select user_type from public.profiles where id = $1",
    [user.id]
  )
  if (me?.user_type !== "aluno") return { ok: false, error: "Apenas alunos podem avaliar professores" }

  const teacher = await queryOne<{ user_type: string; slug: string | null }>(
    "select user_type, slug from public.profiles where id = $1",
    [teacherId]
  )
  if (teacher?.user_type !== "professor") return { ok: false, error: "Professor nao encontrado" }

  try {
    await query(
      `insert into public.professor_reviews (teacher_id, student_id, rating, comment)
       values ($1, $2, $3, $4)
       on conflict (teacher_id, student_id)
       do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()`,
      [teacherId, user.id, r, cleanComment]
    )
  } catch (e: any) {
    console.error("[submitProfessorReview]", e)
    return { ok: false, error: "Erro ao salvar avaliacao" }
  }

  if (teacher.slug) revalidatePath(`/professor/${teacher.slug}`)
  return { ok: true }
}
