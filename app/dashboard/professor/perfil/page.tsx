import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getCurrentDashboardProfile } from "@/app/actions/profile"
import { getProfileSocialStats } from "@/app/actions/follows"
import {
  listContentCommentPreviews,
  listMyContentItemsForProfessor,
} from "@/app/actions/content-items"
import { ProfilePageEditor } from "@/components/dashboard/profile-page-editor"
import { ProfessorContentFeed } from "@/components/dashboard/professor-content-feed"

export const dynamic = "force-dynamic"

export default async function ProfessorPerfilPage() {
  const profile = await getCurrentDashboardProfile()
  if (!profile) redirect("/login")
  if (!profile.user_type) redirect("/cadastro/tipo-conta")
  if (profile.user_type !== "professor") redirect("/dashboard/aluno/perfil")

  const socialStats = await getProfileSocialStats(profile.id, "professor")
  const items = await listMyContentItemsForProfessor()
  const commentPreviews = await listContentCommentPreviews(items.map((i) => i.id), 2)
  const publishedCount = items.filter((i) => i.status === "published").length

  return (
    <div className="space-y-8">
      <ProfilePageEditor initialProfile={profile} profileType="professor" socialStats={socialStats} />

      <section className="max-w-4xl mx-auto w-full px-4 pb-20 lg:pb-0">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-gray-900">Minhas publicações</h2>
            <p className="text-sm text-gray-500">
              {items.length === 0
                ? "Você ainda não publicou conteúdo."
                : `${publishedCount} publicada(s) · ${items.length} no total`}
            </p>
          </div>
          <Link
            href="/dashboard/professor/criar"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1D4ED8] hover:underline shrink-0"
          >
            Criar conteúdo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <ProfessorContentFeed
          authorName={profile.full_name ?? null}
          authorAvatarUrl={profile.avatar_url ?? null}
          initialItems={items}
          initialCommentPreviews={commentPreviews}
          viewerUserId={profile.id}
        />
      </section>
    </div>
  )
}
