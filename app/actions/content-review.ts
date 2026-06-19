"use server"

import { revalidatePath } from "next/cache"
import { getApprovedProfessorActionAccess } from "@/lib/auth/guards"
import { query, queryOne } from "@/lib/db/query"
import type {
  ContentItemStatus,
  ContentItemType,
  ContentReviewFinding,
  ContentReviewResult,
  ContentReviewSeal,
} from "@/lib/content/types"

export type ReviewedContentItem = {
  id: string
  title: string
  type: ContentItemType
  status: ContentItemStatus
  score: number
  seal: ContentReviewSeal
  findings: ContentReviewFinding[]
  warningReason: string | null
  reviewedAt: string
}

export async function listMyReviewedContent(): Promise<ReviewedContentItem[]> {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) return []

  type Row = {
    id: string
    title: string
    type: string
    status: string
    score: number
    seal: string
    findings: unknown
    warning_reason: string | null
    reviewed_at: string
  }

  const rows = await query<Row>(
    `select
       ci.id,
       ci.title,
       ci.type,
       ci.status,
       crr.score,
       crr.seal,
       crr.findings,
       crr.warning_reason,
       crr.reviewed_at
     from public.content_items ci
     inner join public.content_review_results crr on crr.content_item_id = ci.id
     where ci.author_id = $1
     order by ci.updated_at desc`,
    [access.userId]
  )

  const items: ReviewedContentItem[] = []
  for (const r of rows ?? []) {
    items.push({
      id: r.id,
      title: r.title,
      type: r.type as ContentItemType,
      status: r.status as ContentItemStatus,
      score: Number(r.score ?? 0),
      seal: r.seal as ContentReviewSeal,
      findings: Array.isArray(r.findings)
        ? (r.findings as ContentReviewFinding[])
        : [],
      warningReason: r.warning_reason,
      reviewedAt: r.reviewed_at,
    })
  }

  return items.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
}

/** Professor busca o resultado da revisão do agente para um artigo seu. */
export async function getMyContentReview(
  contentItemId: string
): Promise<ContentReviewResult | null> {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) return null

  type Row = {
    id: string
    content_item_id: string
    score: number
    seal: string
    findings: unknown
    warning_reason: string | null
    reviewed_at: string
  }

  const row = await queryOne<Row>(
    `select
       crr.id,
       crr.content_item_id,
       crr.score,
       crr.seal,
       crr.findings,
       crr.warning_reason,
       crr.reviewed_at
     from public.content_review_results crr
     inner join public.content_items ci on ci.id = crr.content_item_id
     where crr.content_item_id = $1
       and ci.author_id = $2`,
    [contentItemId, access.userId]
  )

  if (!row) return null
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    score: Number(row.score ?? 0),
    seal: row.seal as ContentReviewSeal,
    findings: Array.isArray(row.findings) ? row.findings : [],
    warningReason: row.warning_reason ?? null,
    reviewedAt: row.reviewed_at,
  }
}

/**
 * Professor decide o que fazer após revisão com score 50–80 (status aguardando_decisao).
 * - "publish": publica mesmo assim (com aviso no resultado)
 * - "revise": volta para rascunho para editar e reenviar
 */
export async function professorDecideAfterReview(
  contentItemId: string,
  decision: "publish" | "revise"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await getApprovedProfessorActionAccess()
  if (!access.ok) return { ok: false, error: access.error }

  type ItemRow = { id: string; published_at: string | null }
  const item = await queryOne<ItemRow>(
    `select id, published_at
     from public.content_items
     where id = $1 and author_id = $2 and status = 'aguardando_decisao'`,
    [contentItemId, access.userId]
  )

  if (!item) {
    return { ok: false, error: "Artigo nao encontrado ou nao aguarda decisao" }
  }

  try {
    if (decision === "publish") {
      const publishedAt = item.published_at ?? new Date().toISOString()
      await query(
        `update public.content_items
         set status = 'published', published_at = $3
         where id = $1 and author_id = $2`,
        [contentItemId, access.userId, publishedAt]
      )
    } else {
      await query(
        `update public.content_items
         set status = 'draft'
         where id = $1 and author_id = $2`,
        [contentItemId, access.userId]
      )
    }
  } catch (e: any) {
    return { ok: false, error: "Erro" }
  }

  revalidatePath("/dashboard/professor")
  revalidatePath("/dashboard/professor/perfil")
  revalidatePath(`/conteudo/${contentItemId}`)
  return { ok: true }
}
