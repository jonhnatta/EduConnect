export type ActivityAttachment = {
  url: string
  pathname: string
  filename: string
  contentType: string
  size: number
  uploadedAt: string
}

export const ACTIVITY_ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export const ACTIVITY_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024

export const ACTIVITY_ATTACHMENT_MAX_PER_ACTIVITY = 8

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
}

export function inferMimeFromFilename(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase()
  if (!ext) return null
  return EXT_TO_MIME[ext] ?? null
}

export function isAllowedActivityAttachmentType(
  mime: string,
  filename: string
): boolean {
  if (mime && ALLOWED_TYPES.has(mime)) return true
  const inferred = inferMimeFromFilename(filename)
  return inferred != null && ALLOWED_TYPES.has(inferred)
}

export function effectiveContentType(file: File): string {
  if (file.type && ALLOWED_TYPES.has(file.type)) return file.type
  return inferMimeFromFilename(file.name) ?? file.type
}

export function parseActivityAttachments(
  settings: Record<string, unknown> | null | undefined
): ActivityAttachment[] {
  const raw = settings?.attachments
  if (!Array.isArray(raw)) return []
  const out: ActivityAttachment[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    if (typeof o.url !== "string" || typeof o.filename !== "string") continue
    out.push({
      url: o.url,
      pathname: typeof o.pathname === "string" ? o.pathname : o.url,
      filename: o.filename,
      contentType:
        typeof o.contentType === "string"
          ? o.contentType
          : "application/octet-stream",
      size: typeof o.size === "number" ? o.size : 0,
      uploadedAt: typeof o.uploadedAt === "string" ? o.uploadedAt : "",
    })
  }
  return out
}

function isLikelyVercelBlobHost(hostname: string): boolean {
  return (
    /\.blob\.vercel-storage\.com$/i.test(hostname) ||
    hostname === "vercel-storage.com" ||
    hostname.endsWith(".vercel-storage.com")
  )
}

function isSimulatorUrl(url: string): boolean {
  return url.startsWith("blob-sim://")
}

export type ClassroomBlobKind = "activity" | "material"

export function blobPathPrefixForClassroom(
  classroomId: string,
  kind: ClassroomBlobKind
): string {
  const base =
    kind === "activity" ? "classroom-activities" : "classroom-materials"
  return `${base}/${classroomId}/`
}

export function assertBlobAttachmentsForClassroom(
  list: ActivityAttachment[],
  classroomId: string,
  kind: ClassroomBlobKind
): string | null {
  const prefix = blobPathPrefixForClassroom(classroomId, kind)
  for (const a of list) {
    if (!a.pathname.includes(prefix)) {
      return "Anexo nao pertence a esta sala"
    }
    if (!isSimulatorUrl(a.url)) {
      try {
        const u = new URL(a.url)
        if (u.protocol !== "https:" || !isLikelyVercelBlobHost(u.hostname)) {
          return "URL de anexo invalida"
        }
      } catch {
        return "URL de anexo invalida"
      }
    }
  }
  return null
}

export function assertAttachmentsBelongToClassroom(
  list: ActivityAttachment[],
  classroomId: string
): string | null {
  return assertBlobAttachmentsForClassroom(list, classroomId, "activity")
}

export function safeUploadFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file"
  const s = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
  return s || "file"
}
