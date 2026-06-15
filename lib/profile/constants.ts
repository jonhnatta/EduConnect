/** Limite de caracteres da descricao (bio) do perfil. Compartilhado entre server action e UI. */
export const BIO_MAX_CHARS = 780

/** Limite curto para o objetivo/area de foco atual do aluno. */
export const STUDY_FOCUS_MAX_CHARS = 160

export const EDUCATION_LEVEL_OPTIONS = [
  "Ensino fundamental",
  "Ensino medio",
  "Ensino tecnico",
  "Ensino superior",
  "Pos-graduacao",
  "Cursos livres",
] as const

export const EMPLOYMENT_STATUS_OPTIONS = [
  "nao_informado",
  "empregado",
  "buscando_emprego",
  "buscando_estagio",
  "freelancer",
] as const

export const EMPLOYMENT_STATUS_LABELS: Record<(typeof EMPLOYMENT_STATUS_OPTIONS)[number], string> = {
  nao_informado: "Nao informado",
  empregado: "Empregado",
  buscando_emprego: "Buscando emprego",
  buscando_estagio: "Buscando estagio",
  freelancer: "Freelancer",
}
