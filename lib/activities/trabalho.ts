import { parseActivityAttachments, type ActivityAttachment } from "./attachments"

export type TrabalhoMode = "texto" | "arquivo" | "ambos"

export type TrabalhoSubmissionConfig = {
  mode: TrabalhoMode
  /** Máximo de arquivos que o aluno pode anexar (1..10). Só relevante quando o modo inclui arquivo. */
  maxFiles: number
}

/** Limite duro da plataforma para arquivos por entrega de trabalho. */
export const TRABALHO_MAX_FILES_LIMIT = 10
export const TRABALHO_DEFAULT_MAX_FILES = 1

const MODES: TrabalhoMode[] = ["texto", "arquivo", "ambos"]

export function clampTrabalhoMaxFiles(n: unknown): number {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v) || v < 1) return TRABALHO_DEFAULT_MAX_FILES
  return Math.min(v, TRABALHO_MAX_FILES_LIMIT)
}

/** Lê a configuração de entrega de um trabalho a partir de settings.submission. */
export function parseTrabalhoConfig(
  settings: Record<string, unknown> | null | undefined
): TrabalhoSubmissionConfig | null {
  const raw = settings?.submission
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const mode = MODES.includes(o.mode as TrabalhoMode) ? (o.mode as TrabalhoMode) : null
  if (!mode) return null
  return { mode, maxFiles: clampTrabalhoMaxFiles(o.maxFiles) }
}

export function trabalhoModeRequiresText(mode: TrabalhoMode): boolean {
  return mode === "texto" || mode === "ambos"
}

export function trabalhoModeRequiresFile(mode: TrabalhoMode): boolean {
  return mode === "arquivo" || mode === "ambos"
}

/** Lê os anexos enviados pelo aluno (mesma forma de ActivityAttachment). */
export function parseSubmissionAttachments(
  raw: unknown
): ActivityAttachment[] {
  return parseActivityAttachments({ attachments: raw })
}

export const TRABALHO_MODE_LABELS: Record<TrabalhoMode, string> = {
  texto: "Texto na plataforma",
  arquivo: "Arquivo anexado",
  ambos: "Texto e arquivo",
}
