import {
  EDUCATION_LEVEL_OPTIONS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_OPTIONS,
} from "@/lib/profile/constants"

export type EducationLevel = (typeof EDUCATION_LEVEL_OPTIONS)[number]
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS_OPTIONS)[number]

export function buildStudentProfilePath(slug: string) {
  return `/aluno/${encodeURIComponent(slug)}`
}

export function slugifyProfileValue(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

export function employmentStatusLabel(value: string | null | undefined) {
  if (!value) return EMPLOYMENT_STATUS_LABELS.nao_informado
  return EMPLOYMENT_STATUS_LABELS[value as EmploymentStatus] ?? EMPLOYMENT_STATUS_LABELS.nao_informado
}
