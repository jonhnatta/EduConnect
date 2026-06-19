import { Rss } from "lucide-react"
import { requireProfessorAccess } from "@/lib/auth/guards"
import { getProfessorCommunityFeed } from "@/app/actions/content-items"
import { ProfessorCommunityFeed } from "@/components/dashboard/professor-community-feed"

export const dynamic = "force-dynamic"

export default async function ProfessorFeedPage() {
  await requireProfessorAccess()
  const items = await getProfessorCommunityFeed(40)

  return (
    <div className="max-w-3xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Rss className="h-5 w-5 text-[#1D4ED8]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Feed da comunidade</h1>
          <p className="text-sm text-gray-500">
            Publicacoes de outros professores. Siga colegas para ve-los no topo.
          </p>
        </div>
      </div>

      <ProfessorCommunityFeed items={items} />
    </div>
  )
}
