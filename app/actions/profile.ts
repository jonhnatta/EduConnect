"use server"

import { put, del } from "@/lib/blob"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import type { PoolClient } from "pg"
import { z } from "zod"
import { requireAuthedUser } from "@/lib/auth/user"
import { query, queryOne } from "@/lib/db/query"
import {
  inferMimeFromFilename,
  safeUploadFilename,
} from "@/lib/activities/attachments"
import {
  BIO_MAX_CHARS,
  EDUCATION_LEVEL_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  STUDY_FOCUS_MAX_CHARS,
} from "@/lib/profile/constants"
import { buildStudentProfilePath, buildTeacherProfilePath, slugifyProfileValue } from "@/lib/profile/public"
import { dbPool } from "@/lib/db/pool"

export type ProfileVisibility = "public" | "private"
export type DashboardProfile = {
  id: string
  full_name: string | null
  user_type: "aluno" | "professor"
  avatar_url: string | null
  cover_url: string | null
  website_url: string | null
  bio: string | null
  interests: string[]
  slug: string | null
  education_level: string | null
  employment_status: string | null
  study_focus: string | null
  profile_visibility: ProfileVisibility
}

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

/** Confere a assinatura (magic bytes) do arquivo; ignora o Content-Type declarado. */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png"
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg"
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp"
  }
  return null
}

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome").max(120, "Nome muito longo"),
  bio: z.string().trim().max(BIO_MAX_CHARS, `Descricao deve ter ate ${BIO_MAX_CHARS} caracteres`).optional(),
  websiteUrl: z.string().trim().url("Informe uma URL valida").max(240, "Site muito longo").optional().or(z.literal("")),
  interests: z.array(z.string().trim().min(1).max(40)).max(16).default([]),
  slug: z.string().trim().max(60, "Slug muito longo").optional().default(""),
  educationLevel: z.enum(EDUCATION_LEVEL_OPTIONS).optional().nullable(),
  employmentStatus: z.enum(EMPLOYMENT_STATUS_OPTIONS).optional().nullable(),
  studyFocus: z.string().trim().max(STUDY_FOCUS_MAX_CHARS, `Objetivo deve ter ate ${STUDY_FOCUS_MAX_CHARS} caracteres`).optional(),
  profileVisibility: z.enum(["public", "private"]),
})

function isProfileImageType(mime: string, filename: string): boolean {
  if (mime && PROFILE_IMAGE_TYPES.has(mime)) return true
  const inferred = inferMimeFromFilename(filename)
  return inferred != null && PROFILE_IMAGE_TYPES.has(inferred)
}

/**
 * Extrai a referencia do blob a partir do valor salvo na coluna, para remocao.
 * Aceita a URL de servicao atual (/api/profile-image?pathname=...) e tambem
 * URLs diretas do Blob (dados legados). Retorna null se nao houver o que apagar.
 */
function blobRefFromStoredUrl(stored: string | null): string | null {
  if (!stored) return null
  if (stored.startsWith("/api/")) {
    const marker = "pathname="
    const at = stored.indexOf(marker)
    if (at === -1) return null
    const rest = stored.slice(at + marker.length)
    const end = rest.indexOf("&")
    return decodeURIComponent(end === -1 ? rest : rest.slice(0, end)) || null
  }
  return /^https?:\/\//.test(stored) ? stored : null
}

type CurrentProfileRow = DashboardProfile

async function ensureUniqueStudentSlug(
  client: PoolClient,
  input: string,
  userId: string,
) {
  const base = slugifyProfileValue(input) || `aluno-${userId.slice(0, 8)}`
  let candidate = base
  let suffix = 2

  while (true) {
    const row = await client.query<{ id: string }>(
      "select id from public.profiles where lower(slug) = lower($1) and id <> $2 limit 1",
      [candidate, userId]
    )
    if (row.rowCount === 0) return candidate
    candidate = `${base}-${suffix}`
    suffix += 1
  }
}

function revalidateProfilePaths(userType?: string | null, previousSlug?: string | null, nextSlug?: string | null) {
  revalidatePath("/dashboard/aluno/perfil")
  revalidatePath("/dashboard/professor/perfil")
  if (userType === "aluno") revalidatePath("/dashboard/aluno")
  if (userType === "professor") revalidatePath("/dashboard/professor")
  if (userType === "aluno" && previousSlug) revalidatePath(buildStudentProfilePath(previousSlug))
  if (userType === "aluno" && nextSlug && nextSlug !== previousSlug) revalidatePath(buildStudentProfilePath(nextSlug))
  if (userType === "professor" && previousSlug) revalidatePath(buildTeacherProfilePath(previousSlug))
  if (userType === "professor" && nextSlug && nextSlug !== previousSlug) revalidatePath(buildTeacherProfilePath(nextSlug))
}

export async function getCurrentDashboardProfile(): Promise<DashboardProfile | null> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return null

  return queryOne<DashboardProfile>(
    `select id, full_name, user_type, avatar_url, cover_url, website_url, bio, slug,
            education_level, employment_status, study_focus,
            coalesce(interests, array[]::text[]) as interests,
            coalesce(profile_visibility, 'private') as profile_visibility
       from public.profiles
      where id = $1`,
    [user.id]
  )
}

export async function updateDashboardProfile(input: unknown): Promise<
  | { ok: true; profile: DashboardProfile }
  | { ok: false; error: string }
> {
  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Dados invalidos" }
  }

  const interests = [...new Set(parsed.data.interests.map((item) => item.trim()).filter(Boolean))]
  const normalizedSlugInput = parsed.data.slug.trim()
  if (normalizedSlugInput && slugifyProfileValue(normalizedSlugInput) !== normalizedSlugInput) {
    return { ok: false, error: "Use um link publico com letras minusculas, numeros e hifens" }
  }

  const pool = dbPool()
  const client = await pool.connect()

  try {
    await client.query("begin")

    const current = await client.query<CurrentProfileRow>(
      `select id, full_name, user_type, avatar_url, cover_url, website_url, bio, slug,
              education_level, employment_status, study_focus,
              coalesce(interests, array[]::text[]) as interests,
              coalesce(profile_visibility, 'private') as profile_visibility
         from public.profiles
        where id = $1
        limit 1`,
      [user.id]
    )
    const existing = current.rows[0]
    if (!existing) {
      await client.query("rollback")
      return { ok: false, error: "Perfil nao encontrado" }
    }

    const nextSlug =
      existing.user_type === "aluno"
        ? await ensureUniqueStudentSlug(client, normalizedSlugInput || parsed.data.fullName, user.id)
        : existing.slug

    const nextEducationLevel =
      existing.user_type === "aluno" ? parsed.data.educationLevel ?? null : existing.education_level
    const nextEmploymentStatus =
      existing.user_type === "aluno" ? parsed.data.employmentStatus ?? null : existing.employment_status
    const nextStudyFocus =
      existing.user_type === "aluno" ? parsed.data.studyFocus?.trim() || null : existing.study_focus

    const result = await client.query<DashboardProfile>(
      `update public.profiles
          set full_name = $1,
              bio = $2,
              website_url = $3,
              interests = $4,
              profile_visibility = $5,
              slug = $6,
              education_level = $7,
              employment_status = $8,
              study_focus = $9
        where id = $10
        returning id, full_name, user_type, avatar_url, cover_url, website_url, bio, slug,
                  education_level, employment_status, study_focus,
                  coalesce(interests, array[]::text[]) as interests,
                  coalesce(profile_visibility, 'private') as profile_visibility`,
      [
        parsed.data.fullName,
        parsed.data.bio?.trim() || null,
        parsed.data.websiteUrl?.trim() || null,
        interests,
        parsed.data.profileVisibility,
        nextSlug,
        nextEducationLevel,
        nextEmploymentStatus,
        nextStudyFocus,
        user.id,
      ]
    )
    const profile = result.rows[0]
    if (!profile) {
      await client.query("rollback")
      return { ok: false, error: "Perfil nao encontrado" }
    }

    await client.query("commit")
    revalidateProfilePaths(profile.user_type, existing.slug, profile.slug)
    return { ok: true, profile }
  } catch (e: any) {
    await client.query("rollback").catch(() => {})
    return { ok: false, error: "Erro ao salvar perfil" }
  } finally {
    client.release()
  }
}

export async function uploadProfileImage(
  kind: "avatar" | "cover",
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return { ok: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" }

  const user = await requireAuthedUser().catch(() => null)
  if (!user) return { ok: false, error: "Nao autenticado" }

  const raw = formData.get("file")
  if (!(raw instanceof File) || raw.size === 0) {
    return { ok: false, error: "Selecione uma imagem" }
  }
  if (raw.size > PROFILE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Imagem muito grande (max 5 MB)" }
  }
  if (!isProfileImageType(raw.type, raw.name)) {
    return { ok: false, error: "Use JPEG, PNG ou WebP" }
  }

  // Valida o conteudo real do arquivo (magic bytes), nao apenas o Content-Type.
  const bytes = Buffer.from(await raw.arrayBuffer())
  const sniffed = sniffImageMime(bytes)
  if (!sniffed || !PROFILE_IMAGE_TYPES.has(sniffed)) {
    return { ok: false, error: "Arquivo invalido: envie uma imagem JPEG, PNG ou WebP" }
  }

  const column = kind === "avatar" ? "avatar_url" : "cover_url"

  // Le a imagem atual ANTES de enviar a nova, para remove-la depois (evita
  // acumulo de blobs orfaos no store a cada troca de avatar/capa).
  const prev = await queryOne<{ url: string | null; user_type: string; slug: string | null }>(
    `select ${column} as url, user_type, slug from public.profiles where id = $1`,
    [user.id]
  )
  if (!prev) return { ok: false, error: "Perfil nao encontrado" }

  const safe = safeUploadFilename(raw.name)
  const pathname = `profiles/${user.id}/${kind}-${randomUUID()}-${safe}`

  let blob: Awaited<ReturnType<typeof put>>
  try {
    blob = await put(pathname, bytes, {
      access: "private",
      token,
      contentType: sniffed,
    })
  } catch (e: any) {
    return { ok: false, error: "Falha no upload" }
  }

  // Store privado: a imagem e servida via rota com token, nao pela URL direta do Blob.
  const servingUrl = `/api/profile-image?pathname=${encodeURIComponent(blob.pathname)}`

  try {
    await query(
      `update public.profiles set ${column} = $1 where id = $2`,
      [servingUrl, user.id]
    )
  } catch (e: any) {
    // Falha ao salvar: remove o blob recem-enviado para nao deixar orfao.
    await del(blob.url, { token }).catch(() => {})
    return { ok: false, error: "Erro ao salvar imagem" }
  }

  // Best-effort: remove a imagem anterior do store (nao bloqueia o sucesso).
  const oldRef = blobRefFromStoredUrl(prev.url)
  if (oldRef) {
    await del(oldRef, { token }).catch((e) =>
      console.error("[profile] blob anterior nao removido:", e)
    )
  }

  revalidateProfilePaths(prev.user_type, prev.slug, prev.slug)
  return { ok: true, url: servingUrl }
}
