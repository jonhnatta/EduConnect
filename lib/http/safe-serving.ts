// Endurecimento das rotas que fazem streaming de blobs privados.
// O content-type vem do blob (definido no upload, parcialmente controlavel por quem envia).
// Sem isso, um arquivo servido "inline" com content-type text/html/svg executaria no dominio
// do app (XSS armazenado). Forcamos nosniff e so permitimos render inline para tipos seguros.

const INLINE_SAFE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
])

/**
 * Aplica X-Content-Type-Options: nosniff e define Content-Disposition:
 * inline para tipos seguros (imagens/video/pdf), attachment para o resto.
 */
export function applySafeServingHeaders(
  headers: Headers,
  friendlyName: string
): void {
  headers.set("x-content-type-options", "nosniff")

  const contentType = (headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()
  const inline = INLINE_SAFE_TYPES.has(contentType)

  // Sobrescreve sempre: nao confiar em disposition vindo do blob.
  headers.set(
    "content-disposition",
    `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(friendlyName)}`
  )
}
