import { query, queryOne } from "@/lib/db/query"
import { createNotification, notifyFollowersNewContent } from "@/lib/notifications/event"
import type { ContentReviewFinding } from "./types"

const XAI_API_URL = "https://api.x.ai/v1/chat/completions"

function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const SYSTEM_PROMPT = `Você é um agente de moderação da EduConnect, plataforma educacional brasileira para professores e alunos.

Revise o artigo educacional enviado usando seu conhecimento interno e retorne uma análise estruturada em JSON.

CRITÉRIOS DE PONTUAÇÃO (total 0-100):
1. Verificação de Fatos (0-30 pts): Com base no seu conhecimento, verifique se as principais afirmações são verdadeiras e precisas.
2. Originalidade / Plágio (0-30 pts): Avalie se o texto parece original ou se é uma cópia de conteúdo amplamente conhecido sem atribuição.
3. Conteúdo Adequado (0-20 pts): Ausência de material ilícito, ofensivo, discriminatório ou inadequado para uma plataforma educacional.
4. Qualidade Educacional (0-20 pts): Clareza, profundidade, estrutura e relevância pedagógica do conteúdo.

Retorne APENAS um objeto JSON válido, sem markdown, sem texto antes ou depois:
{
  "score": <inteiro 0-100>,
  "seal": <"none" | "excellence">,
  "findings": [
    {
      "category": <"fact_check" | "plagiarism" | "illegal_content" | "quality">,
      "severity": <"ok" | "warning" | "critical">,
      "description": <string em português, máximo 200 caracteres>
    }
  ],
  "warning_reason": <string em português resumindo os problemas encontrados, ou null se score >= 80>
}

Regras obrigatórias:
- "seal" deve ser "excellence" apenas se score > 80; caso contrário "none".
- "warning_reason" deve ser null se score >= 80.
- Inclua ao menos um finding por categoria avaliada.`

interface XaiRawReview {
  score: unknown
  seal: unknown
  findings: unknown
  warning_reason: unknown
}

function parseReview(raw: XaiRawReview): {
  score: number
  seal: "none" | "excellence"
  findings: ContentReviewFinding[]
  warningReason: string | null
} {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0)))
  const seal = score > 80 ? "excellence" : "none"

  const findings: ContentReviewFinding[] = Array.isArray(raw.findings)
    ? (raw.findings as ContentReviewFinding[]).filter(
        (f) =>
          typeof f === "object" &&
          f !== null &&
          ["fact_check", "plagiarism", "illegal_content", "quality"].includes(f.category) &&
          ["ok", "warning", "critical"].includes(f.severity) &&
          typeof f.description === "string"
      )
    : []

  const warningReason =
    score >= 80
      ? null
      : typeof raw.warning_reason === "string" && raw.warning_reason.trim()
        ? raw.warning_reason.trim()
        : null

  return { score, seal, findings, warningReason }
}

export async function runArticleReview(contentItemId: string): Promise<void> {
  const item = await queryOne<{ id: string; title: string; body_html: string | null; published_at: string | null; author_id: string }>(
    "select id, title, body_html, published_at, author_id from public.content_items where id = $1 and status = 'verificando'",
    [contentItemId]
  )

  if (!item) return

  const plainText = toPlainText(item.body_html ?? "")
  const userMessage = `Título: ${item.title}\n\nConteúdo:\n${plainText.slice(0, 8000)}`

  let score: number
  let seal: "none" | "excellence"
  let findings: ContentReviewFinding[]
  let warningReason: string | null

  try {
    const res = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`xAI status ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? "{}"
    // extrair JSON mesmo que o modelo envolva em markdown ```json ... ```
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()
    const raw = JSON.parse(jsonStr) as XaiRawReview
    ;({ score, seal, findings, warningReason } = parseReview(raw))
  } catch (err) {
    console.error("[review-agent] Erro ao chamar xAI:", err)
    // Falha técnica: devolve para rascunho para o professor tentar novamente
    await query(
      "update public.content_items set status = 'draft' where id = $1",
      [contentItemId]
    ).catch(() => {})
    return
  }

  // Determinar novo status baseado na pontuação
  const newStatus =
    score < 50 ? "revisao" : score <= 80 ? "aguardando_decisao" : "published"

  await query(
    `insert into public.content_review_results
       (content_item_id, score, seal, findings, warning_reason, reviewed_at)
     values ($1, $2, $3, $4::jsonb, $5, $6)
     on conflict (content_item_id)
     do update set
       score = excluded.score,
       seal = excluded.seal,
       findings = excluded.findings,
       warning_reason = excluded.warning_reason,
       reviewed_at = excluded.reviewed_at`,
    [
      contentItemId,
      score,
      seal,
      JSON.stringify(findings ?? []),
      warningReason,
      new Date().toISOString(),
    ]
  )

  // published_at só é definido na primeira publicação — preserva data original em re-publicações
  const isFirstPublish = newStatus === "published" && !item.published_at

  await query(
    `update public.content_items
     set status = $2,
         published_at = coalesce($3, published_at)
     where id = $1`,
    [contentItemId, newStatus, isFirstPublish ? new Date().toISOString() : null]
  )

  // Notifica professor quando artigo é reprovado ou aguarda decisão manual
  if (newStatus === "revisao" || newStatus === "aguardando_decisao") {
    const msg = newStatus === "revisao"
      ? `Seu artigo "${item.title}" foi reprovado na revisão automática.`
      : `Seu artigo "${item.title}" precisa de revisão manual antes de ser publicado.`
    await createNotification({
      recipientId: item.author_id,
      type: "review_result",
      entityId: contentItemId,
      entityType: "content_item",
      message: msg,
    }).catch(err => console.error("[review-agent notify]", err))
  }

  // Notifica seguidores na primeira publicação
  if (isFirstPublish) {
    const publishInfo = await queryOne<{ full_name: string | null; type: string }>(
      `SELECT p.full_name, ci.type
         FROM public.content_items ci
         JOIN public.profiles p ON p.id = ci.author_id
        WHERE ci.id = $1`,
      [contentItemId]
    )
    if (publishInfo) {
      const typeLabel = publishInfo.type === "article" ? "artigo" : publishInfo.type === "exercise" ? "exercício" : publishInfo.type === "assessment" ? "prova" : publishInfo.type === "simulado" ? "simulado" : "dica"
      await notifyFollowersNewContent({
        teacherId: item.author_id,
        teacherName: publishInfo.full_name?.trim() || "Professor",
        entityId: contentItemId,
        contentTypeLabel: typeLabel,
        title: item.title,
      }).catch(err => console.error("[review-agent notify followers]", err))
    }
  }
}
