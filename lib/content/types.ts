import type { ActivityExamDefinition } from "@/lib/activities/exam"

/** Dica rapida: no maximo 1 imagem (exclusivo com video). */
export const DICA_MAX_IMAGES = 1 as const

export type ContentItemType =
  | "article"
  | "exercise"
  | "assessment"
  | "simulado"
  | "dica"

export type ContentItemStatus =
  | "draft"
  | "published"
  | "verificando"
  | "revisao"
  | "aguardando_decisao"

export type ContentReviewSeal = "none" | "excellence"

export type ContentReviewFinding = {
  category: "fact_check" | "plagiarism" | "illegal_content" | "quality"
  severity: "ok" | "warning" | "critical"
  description: string
}

export type ContentReviewResult = {
  id: string
  contentItemId: string
  score: number
  seal: ContentReviewSeal
  findings: ContentReviewFinding[]
  warningReason: string | null
  reviewedAt: string
}

export type ContentVisibility = "public" | "classrooms" | "private"

/** Audiência de conteúdo público: todos · só alunos · só professores (comunidade). */
export type ContentAudience = "all" | "students" | "teachers"

export type ContentItemSettings = {
  tags?: string[]
  disciplina?: string
  nivel?: string
  /** Capa em imagem (exclusiva com coverVideoUrl) */
  coverUrl?: string | null
  /** Capa em video (exclusiva com coverUrl) */
  coverVideoUrl?: string | null
  /** Questoes (exercicios publicados em conteudo; mesmo formato que atividades de sala) */
  exam?: ActivityExamDefinition | null
  /** Avaliacao / simulado: prazo de entrega (ISO), obrigatorio ao publicar */
  dueAt?: string | null
  /** Avaliacao / simulado: abertura opcional (ISO); se ausente, considera-se aberta apos publicar */
  startsAt?: string | null
  /** Encerramento manual pelo autor (avaliacao ou simulado) */
  assessmentClosed?: boolean
  /**
   * Dica rapida: video OU imagens (1–4), exclusivos entre si.
   * URLs de exibicao (mesmo padrao /api/article-attachment que capas).
   */
  dicaVideoUrl?: string | null
  /** 1 imagem */
  dicaImageUrls?: string[] | null
}

export type ContentItemRow = {
  id: string
  author_id: string
  type: ContentItemType
  title: string
  body_html: string | null
  status: ContentItemStatus
  visibility: ContentVisibility
  audience: ContentAudience
  published_at: string | null
  settings: ContentItemSettings
  like_count: number
  share_count: number
  comment_count: number
  created_at: string
  updated_at: string
}

export type ShareMethod = "copy_link" | "native_share"
