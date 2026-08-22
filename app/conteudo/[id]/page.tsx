import {
  getContentItemById,
  getMyLikesForContentIds,
  listContentComments,
  recordContentView,
} from "@/app/actions/content-items"
import {
  getMcqSolutionsForContentExercise,
  getMyContentExerciseSubmission,
} from "@/app/actions/content-exercise-submissions"
import { ArticleCoverMedia } from "@/components/dashboard/article-cover-media"
import { RichTextContent } from "@/components/rich-text-content"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  parseExamFromSettings,
  toPublicExam,
  totalExamPoints,
} from "@/lib/activities/exam"
import { computeAssessmentBlockMessageForStudent } from "@/lib/content/assessment-settings"
import { getAuthedUser } from "@/lib/auth/user"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DicaMediaCarousel } from "@/components/dashboard/dica-media-carousel"
import { ConteudoEngagement } from "./conteudo-engagement"
import { ContentComments } from "./content-comments"
import { ConteudoExercisePublic } from "./conteudo-exercise-public"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const res = await getContentItemById(id)
  if (!res.ok) return { title: "Conteudo | EduConnect" }
  const { item } = res
  let description = item.settings?.disciplina ?? "Conteudo educacional"
  if (item.type === "exercise") {
    const ex = parseExamFromSettings(item.settings as Record<string, unknown>)
    const n = ex?.questions.length ?? 0
    description =
      (item.settings?.disciplina ? `${item.settings.disciplina} — ` : "") +
      `Exercicio com ${n} questao${n === 1 ? "" : "es"}`
  }
  if (item.type === "dica") {
    const v = item.settings?.dicaVideoUrl?.trim() || null
    const imgs = Array.isArray(item.settings?.dicaImageUrls)
      ? item.settings.dicaImageUrls.filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0
        )
      : []
    description =
      (item.settings?.disciplina ? `${item.settings.disciplina} — ` : "") +
      (v ? "Dica em video" : imgs.length > 1 ? `Dica com ${imgs.length} fotos` : "Dica rapida")
  }
  if (item.type === "assessment" || item.type === "simulado") {
    const ex = parseExamFromSettings(item.settings as Record<string, unknown>)
    const n = ex?.questions.length ?? 0
    const due = item.settings?.dueAt
    const dueStr =
      typeof due === "string" && due.trim()
        ? ` Prazo: ${new Date(due.trim()).toLocaleString("pt-BR")}.`
        : ""
    const label = item.type === "simulado" ? "Simulado" : "Avaliacao"
    description =
      (item.settings?.disciplina ? `${item.settings.disciplina} — ` : "") +
      `${label} com ${n} questao${n === 1 ? "" : "es"}.${dueStr}`
  }
  return {
    title: `${item.title} | EduConnect`,
    description,
  }
}

function initials(name: string | null): string {
  if (!name?.trim()) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return parts[0].slice(0, 2).toUpperCase()
}

export default async function ConteudoPublicoPage({ params }: Props) {
  const { id } = await params
  const res = await getContentItemById(id)
  if (
    !res.ok ||
    (res.item.type !== "article" &&
      res.item.type !== "dica" &&
      res.item.type !== "exercise" &&
      res.item.type !== "assessment" &&
      res.item.type !== "simulado")
  ) {
    notFound()
  }

  const [likedSet] = await Promise.all([
    getMyLikesForContentIds([id]),
    recordContentView(id),
  ])
  const initialLiked = likedSet.has(id)
  const commentsRes = await listContentComments(id)
  const initialComments = commentsRes.ok ? commentsRes.comments : []
  const viewerUserId = commentsRes.ok ? commentsRes.viewerUserId : null

  const { item, author } = res
  const disciplina = item.settings?.disciplina
  const coverUrl = item.settings?.coverUrl?.trim() || null
  const coverVideoUrl = item.settings?.coverVideoUrl?.trim() || null

  if (item.type === "dica") {
    const dicaVideo = item.settings?.dicaVideoUrl?.trim() || null
    const dicaImages = Array.isArray(item.settings?.dicaImageUrls)
      ? item.settings.dicaImageUrls.filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0
        )
      : []

    return (
      <div className="min-h-screen bg-[#F3F4F6]">
        <header className="border-b border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="text-sm font-medium text-[#1D4ED8] hover:underline">
              EduConnect
            </Link>
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-[#1D4ED8]"
            >
              Entrar
            </Link>
          </div>
        </header>

        <article className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 p-4">
              <DicaMediaCarousel
                videoUrl={dicaVideo}
                imageUrls={dicaImages}
                aspectClassName="aspect-[4/5] max-h-[min(85vh,720px)]"
              />
            </div>
            <div className="p-6 border-b border-gray-100 flex items-start gap-4">
              <Avatar className="h-12 w-12">
                {author.avatar_url ? (
                  <AvatarImage src={author.avatar_url} alt="" />
                ) : null}
                <AvatarFallback className="bg-[#1E3A8A] text-white text-sm">
                  {initials(author.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-gray-900">{author.full_name ?? "Professor"}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {disciplina ? (
                    <Badge variant="secondary">{disciplina}</Badge>
                  ) : null}
                  <Badge variant="outline">Dica rapida</Badge>
                </div>
              </div>
            </div>

            <div className="p-6">
              <h1 className="font-display text-2xl font-bold text-gray-900 mb-4">{item.title}</h1>
              {item.body_html ? (
                <RichTextContent html={item.body_html} className="prose prose-sm max-w-none" />
              ) : (
                <p className="text-gray-500 text-sm">Sem descricao.</p>
              )}
            </div>

            <div className="px-6 pb-6">
              <ConteudoEngagement
                contentItemId={item.id}
                initialLikeCount={item.like_count}
                initialShareCount={item.share_count}
                initialCommentCount={item.comment_count}
                initialLiked={initialLiked}
              />
            </div>

            <div id="comentarios">
              <ContentComments
                contentItemId={item.id}
                initialComments={initialComments}
                initialCommentCount={item.comment_count}
                viewerUserId={viewerUserId}
              />
            </div>
          </div>
        </article>
      </div>
    )
  }

  const user = await getAuthedUser()

  if (item.type === "article") {
    return (
      <div className="min-h-screen bg-[#F3F4F6]">
        <header className="border-b border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="text-sm font-medium text-[#1D4ED8] hover:underline">
              EduConnect
            </Link>
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-[#1D4ED8]"
            >
              Entrar
            </Link>
          </div>
        </header>

        <article className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {coverVideoUrl || coverUrl ? (
              <div className="w-full aspect-[21/9] max-h-72 bg-gray-100 border-b border-gray-100 overflow-hidden">
                <ArticleCoverMedia
                  imageUrl={coverUrl}
                  videoUrl={coverVideoUrl}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}
            <div className="p-6 border-b border-gray-100 flex items-start gap-4">
              <Avatar className="h-12 w-12">
                {author.avatar_url ? (
                  <AvatarImage src={author.avatar_url} alt="" />
                ) : null}
                <AvatarFallback className="bg-[#1E3A8A] text-white text-sm">
                  {initials(author.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-gray-900">{author.full_name ?? "Professor"}</p>
                {disciplina ? (
                  <Badge variant="secondary" className="mt-1">
                    {disciplina}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="p-6">
              <h1 className="font-display text-2xl font-bold text-gray-900 mb-6">{item.title}</h1>
              {item.body_html ? (
                <RichTextContent html={item.body_html} className="prose prose-sm max-w-none" />
              ) : (
                <p className="text-gray-500 text-sm">Sem conteudo.</p>
              )}
            </div>

            <div className="px-6 pb-6">
              <ConteudoEngagement
                contentItemId={item.id}
                initialLikeCount={item.like_count}
                initialShareCount={item.share_count}
                initialCommentCount={item.comment_count}
                initialLiked={initialLiked}
              />
            </div>

            <div id="comentarios">
              <ContentComments
                contentItemId={item.id}
                initialComments={initialComments}
                initialCommentCount={item.comment_count}
                viewerUserId={viewerUserId}
              />
            </div>
          </div>
        </article>
      </div>
    )
  }

  const examDef = parseExamFromSettings(item.settings as Record<string, unknown>)
  if (!examDef) {
    notFound()
  }
  const examPublic = toPublicExam(examDef)
  const maxScore = totalExamPoints(examDef)
  const isAuthor = user?.id === item.author_id

  let initialSubmission = null
  let mcqSolutionsAfterSubmit: Record<string, number> | undefined
  if (user && !isAuthor) {
    const subRes = await getMyContentExerciseSubmission(id)
    initialSubmission = subRes.submission
    if (initialSubmission?.status === "enviado") {
      mcqSolutionsAfterSubmit = (await getMcqSolutionsForContentExercise(id)) ?? undefined
    }
  }

  const assessmentBlockMessage =
    (item.type === "assessment" || item.type === "simulado") && !isAuthor
      ? computeAssessmentBlockMessageForStudent(
          item.settings as Record<string, unknown>,
          initialSubmission
        )
      : null

  const dueAtRaw = item.settings?.dueAt
  const startsAtRaw = item.settings?.startsAt
  const dueAtLabel =
    typeof dueAtRaw === "string" && dueAtRaw.trim()
      ? new Date(dueAtRaw.trim()).toLocaleString("pt-BR")
      : null
  const startsAtLabel =
    typeof startsAtRaw === "string" && startsAtRaw.trim()
      ? new Date(startsAtRaw.trim()).toLocaleString("pt-BR")
      : null

  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-medium text-[#1D4ED8] hover:underline">
            EduConnect
          </Link>
          <Link
            href="/login"
            className="text-sm text-gray-600 hover:text-[#1D4ED8]"
          >
            Entrar
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {coverUrl ? (
            <div className="w-full aspect-[21/9] max-h-72 bg-gray-100 border-b border-gray-100 overflow-hidden">
              <ArticleCoverMedia
                imageUrl={coverUrl}
                videoUrl={null}
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}
          <div className="p-6 border-b border-gray-100 flex items-start gap-4">
            <Avatar className="h-12 w-12">
              {author.avatar_url ? (
                <AvatarImage src={author.avatar_url} alt="" />
              ) : null}
              <AvatarFallback className="bg-[#1E3A8A] text-white text-sm">
                {initials(author.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-gray-900">{author.full_name ?? "Professor"}</p>
              {disciplina ? (
                <Badge variant="secondary" className="mt-1">
                  {disciplina}
                </Badge>
              ) : null}
              <Badge variant="outline" className="mt-2 block w-fit">
                {item.type === "assessment"
                  ? "Avaliacao"
                  : item.type === "simulado"
                    ? "Simulado"
                    : "Exercicio"}
              </Badge>
              {item.type === "assessment" || item.type === "simulado" ? (
                <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                  {startsAtLabel ? (
                    <p>
                      <span className="font-medium text-gray-800">Abertura:</span>{" "}
                      {startsAtLabel}
                    </p>
                  ) : null}
                  {dueAtLabel ? (
                    <p>
                      <span className="font-medium text-gray-800">Entrega limite:</span>{" "}
                      {dueAtLabel}
                    </p>
                  ) : null}
                  {item.settings?.assessmentClosed === true ? (
                    <p className="text-amber-800 font-medium">Encerrada pelo professor</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <h1 className="font-display text-2xl font-bold text-gray-900">{item.title}</h1>
              <Link
                href={`/denunciar?targetType=content_item&targetId=${item.id}&returnTo=${encodeURIComponent(`/conteudo/${item.id}`)}`}
                className="shrink-0 text-xs text-red-700 hover:underline"
              >
                Denunciar
              </Link>
            </div>
            {item.body_html ? (
              <RichTextContent html={item.body_html} className="prose prose-sm max-w-none mb-8" />
            ) : null}

            <ConteudoExercisePublic
              contentItemId={id}
              editHref={`/dashboard/professor/criar?edit=${encodeURIComponent(id)}`}
              exam={examPublic}
              maxScore={maxScore}
              isAuthor={isAuthor}
              viewerUserId={user?.id ?? null}
              initialSubmission={initialSubmission}
              mcqSolutionsAfterSubmit={mcqSolutionsAfterSubmit}
              contentKind={
                item.type === "assessment"
                  ? "assessment"
                  : item.type === "simulado"
                    ? "simulado"
                    : "exercise"
              }
              assessmentBlockMessage={assessmentBlockMessage}
            />
          </div>

          <div className="px-6 pb-6">
            <ConteudoEngagement
              contentItemId={item.id}
              initialLikeCount={item.like_count}
              initialShareCount={item.share_count}
              initialCommentCount={item.comment_count}
              initialLiked={initialLiked}
            />
          </div>

          <div id="comentarios">
            <ContentComments
              contentItemId={item.id}
              initialComments={initialComments}
              initialCommentCount={item.comment_count}
              viewerUserId={viewerUserId}
            />
          </div>
        </div>
      </article>
    </div>
  )
}
