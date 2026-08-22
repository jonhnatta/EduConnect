"use client"

type Props = {
  imageUrl?: string | null
  videoUrl?: string | null
  /** Classes no elemento media (img ou video) */
  className?: string
  /** Evita baixar mídia de cards que ainda estão fora da área visível. */
  deferLoading?: boolean
}

/** Capa de artigo: um video OU uma imagem (video tem prioridade se ambos existirem). */
export function ArticleCoverMedia({ imageUrl, videoUrl, className, deferLoading = false }: Props) {
  const v = videoUrl?.trim() || null
  const i = imageUrl?.trim() || null
  if (v) {
    return (
      <video
        src={v}
        className={className}
        controls
        playsInline
        preload={deferLoading ? "none" : "metadata"}
      />
    )
  }
  if (i) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={i}
        alt=""
        className={className}
        loading={deferLoading ? "lazy" : "eager"}
        decoding="async"
      />
    )
  }
  return null
}
